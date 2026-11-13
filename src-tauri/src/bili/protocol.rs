//! 保留客户端原有协议入口，实现在共享核心中维护。

pub use danmaku_core::protocol::*;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::message::{DanmakuEvent, Medal};
    use serde_json::json;

    #[test]
    fn client_paths_use_shared_protocol_and_event_types() {
        let command = json!({"cmd": "LIVE", "live_time": 1_723_979_200u64});
        let packet = make_packet(&serde_json::to_vec(&command).unwrap(), OP_SEND_MSG).unwrap();
        let packets: Vec<danmaku_core::protocol::ParsedPacket> = decode_packets(&packet).unwrap();
        let ParsedPacket::Command(command) = &packets[0] else {
            panic!("expected a command packet");
        };
        let mut events: Vec<DanmakuEvent> = parse_danmaku_events(command, 123);
        let shared_event: danmaku_core::DanmakuEvent = events.remove(0);
        let event: DanmakuEvent = shared_event;
        let shared_medal: Option<danmaku_core::Medal> = event.medal;
        let _: Option<Medal> = shared_medal;

        assert_eq!(event.room_id, 123);
        assert_eq!(event.timestamp, 1_723_979_200);
        assert_eq!(event.event_type, "live");
        assert_eq!(event.content, "开播了");
        assert!(parse_live_status(command, 123, "preparing", "下播了").is_some());
    }
}
