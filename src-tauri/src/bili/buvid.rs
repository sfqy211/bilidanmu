use crate::bili::credential::BiliCredential;
use rand::Rng;

pub fn generate_buvid() -> String {
    let mut rng = rand::thread_rng();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let random_bytes: [u8; 16] = rng.gen();
    let random_hex = random_bytes
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect::<String>();

    format!("{random_hex}-{timestamp}infoc")
}

pub fn ensure_buvid(credential: &mut BiliCredential) {
    if credential.buvid3.as_deref().is_none_or(|value| value.is_empty()) {
        credential.buvid3 = Some(generate_buvid());
    }

    if credential.buvid4.as_deref().is_none_or(|value| value.is_empty()) {
        credential.buvid4 = Some(generate_buvid());
    }
}
