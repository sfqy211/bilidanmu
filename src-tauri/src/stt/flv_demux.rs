//! FLV demuxer that extracts AAC audio frames from an FLV byte stream
//! and wraps them in ADTS headers for decoding by symphonia.

/// Parse the sample rate and channel count from an AAC AudioSpecificConfig (sequence header).
/// The first 2 bytes contain:
/// - bits 15-11: audioObjectType (5 bits, typically 2 = AAC-LC)
/// - bits 10-7:  samplingFrequencyIndex (4 bits)
/// - bits 6-3:   channelConfiguration (4 bits)
fn parse_audio_specific_config(data: &[u8]) -> Option<(u32, u32)> {
    if data.len() < 2 {
        return None;
    }
    let word = ((data[0] as u16) << 8) | (data[1] as u16);
    let _audio_object_type = (word >> 11) & 0x1F;
    let sf_index = (word >> 7) & 0x0F;
    let channels = (word >> 3) & 0x0F;

    let sample_rate = match sf_index {
        0 => 96000,
        1 => 88200,
        2 => 64000,
        3 => 48000,
        4 => 44100,
        5 => 32000,
        6 => 24000,
        7 => 22050,
        8 => 16000,
        9 => 12000,
        10 => 11025,
        11 => 8000,
        12 => 7350,
        _ => 44100, // default fallback
    };

    Some((sample_rate, channels as u32))
}

/// Build a 7-byte ADTS header for a raw AAC frame.
///
/// MPEG-4 ADTS fixed header (28 bits):
/// - syncword: 12 bits (0xFFF)
/// - ID: 1 bit (0 = MPEG-4)
/// - layer: 2 bits (00)
/// - protection_absent: 1 bit (1 = no CRC)
/// - profile: 2 bits (01 = AAC-LC)
/// - sampling_frequency_index: 4 bits
/// - private_bit: 1 bit (0)
/// - channel_configuration: 3 bits
/// - original_copy: 1 bit (0)
/// - home: 1 bit (0)
///
/// Variable header (28 bits):
/// - copyright_identification_bit: 1 bit (0)
/// - copyright_identification_start: 1 bit (0)
/// - frame_length: 13 bits
/// - adts_buffer_fullness: 11 bits (0x7FF = VBR)
/// - number_of_raw_data_blocks: 2 bits (0 = 1 block)
fn build_adts_header(aac_frame_len: usize, sample_rate_idx: u8, channels: u8) -> [u8; 7] {
    let total_len = (aac_frame_len + 7) as u16; // total ADTS frame length in bytes

    let mut hdr = [0u8; 7];

    // byte 0: syncword [11:4]
    hdr[0] = 0xFF;

    // byte 1: syncword[3:0] | ID(0=MPEG4) | layer(00) | protection_absent(1)
    hdr[1] = 0xF1;

    // byte 2: profile(01=AAC-LC) | sf_idx(4) | private(0) | ch[2]
    hdr[2] = (1u8 << 6)                    // profile = AAC-LC
            | ((sample_rate_idx & 0x0F) << 2)
            | ((channels & 0x07) >> 2);     // channel_config[2]

    // byte 3: ch[1:0] | original(0) | home(0) | copyright_id(0) | copyright_start(0) | frame_len[12:11]
    hdr[3] = ((channels & 0x03) << 6)
           | (((total_len >> 11) & 0x03) as u8);

    // byte 4: frame_len[10:3]
    hdr[4] = ((total_len >> 3) & 0xFF) as u8;

    // byte 5: frame_len[2:0] << 5 | buffer_fullness[10:6] (0x7FF = VBR)
    hdr[5] = (((total_len & 0x07) << 5) as u8) | 0x1F;

    // byte 6: buffer_fullness[5:0] << 2 | num_raw_blocks(0)
    hdr[6] = 0xFC;

    hdr
}

/// Map sample rate (Hz) to ADTS sampling_frequency_index.
fn sample_rate_to_index(rate: u32) -> u8 {
    match rate {
        96000 => 0,
        88200 => 1,
        64000 => 2,
        48000 => 3,
        44100 => 4,
        32000 => 5,
        24000 => 6,
        22050 => 7,
        16000 => 8,
        12000 => 9,
        11025 => 10,
        8000 => 11,
        7350 => 12,
        _ => 4, // default to 44100 index
    }
}

/// FLV tag types
const FLV_TAG_AUDIO: u8 = 8;

/// Sound format for AAC in FLV
const SOUND_FORMAT_AAC: u8 = 10;

/// FLV demuxer that extracts AAC frames from an FLV byte stream.
///
/// Handles mid-stream start (sync to FLV header or first audio tag),
/// caches the AAC sequence header for potential re-injection,
/// and wraps raw AAC frames in ADTS headers.
pub struct FlvDemuxer {
    buffer: Vec<u8>,
    synced: bool,
    /// Cached AAC AudioSpecificConfig for potential re-injection
    aac_sequence_header: Option<Vec<u8>>,
    /// Sample rate extracted from AudioSpecificConfig
    sample_rate: u32,
    /// Channel count extracted from AudioSpecificConfig
    channels: u32,
}

impl FlvDemuxer {
    pub fn new() -> Self {
        Self {
            buffer: Vec::new(),
            synced: false,
            aac_sequence_header: None,
            sample_rate: 48000, // default assumption
            channels: 2,        // default assumption
        }
    }

    /// Return the sample rate extracted from the AAC AudioSpecificConfig.
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Return the channel count extracted from the AAC AudioSpecificConfig.
    pub fn channels(&self) -> u32 {
        self.channels
    }

    /// Feed raw bytes from the FLV stream.
    /// Returns ADTS-wrapped AAC frames ready for symphonia decoding.
    pub fn feed_bytes(&mut self, data: &[u8]) -> Vec<Vec<u8>> {
        self.buffer.extend_from_slice(data);
        let mut frames = Vec::new();

        loop {
            // If not synced, try to find the FLV header or first audio tag
            if !self.synced {
                if let Some(pos) = self.find_sync_point() {
                    self.buffer.drain(..pos);
                    self.synced = true;
                } else {
                    // Keep only the last few bytes for potential sync
                    if self.buffer.len() > 16 {
                        let drain_to = self.buffer.len() - 12;
                        self.buffer.drain(..drain_to);
                    }
                    break;
                }
            }

            // Need at least 11 bytes for a tag header + 4 for prev tag size
            if self.buffer.len() < 15 {
                break;
            }

            // Read tag header
            let tag_type = self.buffer[0];
            let data_size = ((self.buffer[1] as usize) << 16)
                          | ((self.buffer[2] as usize) << 8)
                          | (self.buffer[3] as usize);

            let total_tag_len = 11 + data_size + 4; // header + data + prev_tag_size

            if self.buffer.len() < total_tag_len {
                break; // need more data
            }

            if tag_type == FLV_TAG_AUDIO {
                let audio_data = &self.buffer[11..11 + data_size];
                if !audio_data.is_empty() {
                    // First byte of audio data: sound format | sample rate | sample size | sound type
                    let sound_format = (audio_data[0] >> 4) & 0x0F;

                    if sound_format == SOUND_FORMAT_AAC && audio_data.len() >= 2 {
                        let aac_packet_type = audio_data[1];

                        if aac_packet_type == 0 {
                            // AAC sequence header (AudioSpecificConfig)
                            let asc = audio_data[2..].to_vec();
                            if let Some((sr, ch)) = parse_audio_specific_config(&asc) {
                                self.sample_rate = sr;
                                self.channels = ch;
                            }
                            self.aac_sequence_header = Some(audio_data.to_vec());
                        } else if aac_packet_type == 1 {
                            // Raw AAC frame data
                            let aac_data = &audio_data[2..];
                            if !aac_data.is_empty() {
                                let sf_idx = sample_rate_to_index(self.sample_rate);
                                let adts_hdr = build_adts_header(aac_data.len(), sf_idx, self.channels as u8);
                                let mut adts_frame = Vec::with_capacity(7 + aac_data.len());
                                adts_frame.extend_from_slice(&adts_hdr);
                                adts_frame.extend_from_slice(aac_data);
                                frames.push(adts_frame);
                            }
                        }
                        // else: unsupported AAC packet type, skip
                    }
                }
            }

            // Consume the entire tag
            self.buffer.drain(..total_tag_len);
        }

        frames
    }

    /// Find a sync point in the buffer with cross-validation to reduce false matches.
    ///
    /// Validation strategy:
    /// - FLV header "FLV" at the start
    /// - Audio tag (type=8) with reasonable data_size AND matching prev_tag_size
    fn find_sync_point(&self) -> Option<usize> {
        // Look for FLV header: "FLV" at start
        if self.buffer.len() >= 3
            && self.buffer[0] == 0x46  // 'F'
            && self.buffer[1] == 0x4C  // 'L'
            && self.buffer[2] == 0x56  // 'V'
        {
            // Skip FLV header (9 bytes) + first PreviousTagSize (4 bytes) = 13 bytes
            if self.buffer.len() >= 13 {
                return Some(13);
            }
            return None;
        }

        // Look for a valid audio tag with cross-validation:
        // - tag_type == 8
        // - data_size is reasonable (2..65536)
        // - The prev_tag_size field after the tag should equal 11 + data_size
        for i in 0..self.buffer.len().saturating_sub(15) {
            if self.buffer[i] != FLV_TAG_AUDIO {
                continue;
            }

            let data_size = ((self.buffer[i + 1] as usize) << 16)
                          | ((self.buffer[i + 2] as usize) << 8)
                          | (self.buffer[i + 3] as usize);

            // Audio data must be at least 2 bytes and at most a reasonable size
            if data_size < 2 || data_size > 65536 {
                continue;
            }

            let total_tag_len = 11 + data_size + 4; // header + data + prev_tag_size

            // Need enough bytes for the tag + the next prev_tag_size for validation
            if i + total_tag_len + 4 > self.buffer.len() {
                // Not enough data to cross-validate; only accept if full tag present
                if i + total_tag_len <= self.buffer.len() {
                    return Some(i);
                }
                continue;
            }

            // Cross-validate: the 4 bytes after this tag (prev_tag_size of next tag)
            // should equal 11 + data_size of THIS tag
            let expected_prev = 11 + data_size;
            let prev_tag_off = i + 11 + data_size;
            let prev_tag_size = ((self.buffer[prev_tag_off] as usize) << 24)
                              | ((self.buffer[prev_tag_off + 1] as usize) << 16)
                              | ((self.buffer[prev_tag_off + 2] as usize) << 8)
                              | (self.buffer[prev_tag_off + 3] as usize);

            if prev_tag_size == expected_prev {
                return Some(i);
            }
        }

        None
    }
}

impl Default for FlvDemuxer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_audio_specific_config_48k_stereo() {
        // Typical AAC-LC, 48000 Hz, stereo
        // audioObjectType=2(AAC-LC), sf_index=3(48000), channel=2
        // word = 00010_0011_0010_.... = 0x1190 (ignoring remaining bits)
        let word: u16 = (0x02 << 11) | (3 << 7) | (2 << 3);
        let data = [(word >> 8) as u8, word as u8];
        let (sr, ch) = parse_audio_specific_config(&data).unwrap();
        assert_eq!(sr, 48000);
        assert_eq!(ch, 2);
    }

    #[test]
    fn test_build_adts_header() {
        let hdr = build_adts_header(100, 3, 2);
        // Verify first 2 bytes: syncword + ID + layer + protection
        assert_eq!(hdr[0], 0xFF);
        assert_eq!(hdr[1], 0xF1);
        // Total frame length = 107
        let total_len = 107u16;
        // Verify frame_length encoding
        let frame_len_encoded: u16 =
            (((hdr[3] as u16) & 0x03) << 11) |
            ((hdr[4] as u16) << 3) |
            ((hdr[5] as u16) >> 5);
        assert_eq!(frame_len_encoded, total_len);
    }

    #[test]
    fn test_flv_demuxer_empty_feed() {
        let mut demuxer = FlvDemuxer::new();
        let frames = demuxer.feed_bytes(&[]);
        assert!(frames.is_empty());
    }

    #[test]
    fn test_flv_demuxer_aac_sequence_header() {
        let mut demuxer = FlvDemuxer::new();
        let _frames = demuxer.feed_bytes(b"FLV\x01\x05\x00\x00\x00\x09\x00\x00\x00\x00");
        assert!(demuxer.synced);
    }
}
