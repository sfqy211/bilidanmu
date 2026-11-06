//! 直播礼物（打赏）相关命令：礼物面板、背包、瓜子余额、发送礼物。
//!
//! mock 虚拟直播间（房间号 0）下全部命令直接返回 fixture，绝不触网：
//! 发送礼物涉及真实扣费，这是安全底线。
//!
//! 整组功能由 `gift-send` cargo feature 门控（官方发布默认关闭）：feature
//! 关闭时命令一律返回错误、前端也不渲染入口；防止绕过前端直接 invoke
//! 的后置校验也在这里。

use crate::bili::mock;
use crate::commands::{build_api_client, get_sending_credential};
use crate::models::gift::{GiftBagItem, GiftConfig, WalletInfo};
use crate::models::response::BiliResponse;
use crate::AppState;
use tauri::State;

/// 礼物打赏是否随此构建启用（官方发布默认关闭）
#[tauri::command]
pub fn gift_send_enabled() -> bool {
    cfg!(feature = "gift-send")
}

fn ensure_enabled() -> Result<(), String> {
    if cfg!(feature = "gift-send") {
        Ok(())
    } else {
        Err(
            "礼物打赏功能未随此构建启用：涉及真实扣费，官方发布默认关闭；\
             如需使用请自行编译（见 README「礼物打赏」一节）"
                .to_string(),
        )
    }
}

fn mock_active(room_id: u64) -> bool {
    room_id == mock::MOCK_ROOM_ID && mock::is_enabled()
}

pub(crate) fn mock_gifts() -> Vec<GiftConfig> {
    vec![
        GiftConfig {
            id: 1,
            name: "辣条".to_string(),
            price: 100,
            coin_type: "silver".to_string(),
            desc: "银瓜子礼物".to_string(),
            img_basic: String::new(),
        },
        GiftConfig {
            id: 20003,
            name: "小心心".to_string(),
            price: 100,
            coin_type: "gold".to_string(),
            desc: "0.1 元".to_string(),
            img_basic: String::new(),
        },
        GiftConfig {
            id: 32304,
            name: "好运连连".to_string(),
            price: 1000,
            coin_type: "gold".to_string(),
            desc: "盲盒 1 元".to_string(),
            img_basic: String::new(),
        },
        GiftConfig {
            id: 32233,
            name: "梦幻游轮".to_string(),
            price: 150_000,
            coin_type: "gold".to_string(),
            desc: "150 元".to_string(),
            img_basic: String::new(),
        },
    ]
}

pub(crate) fn mock_bag() -> Vec<GiftBagItem> {
    vec![
        GiftBagItem {
            bag_id: 1001,
            gift_id: 1,
            gift_name: "辣条".to_string(),
            gift_num: 520,
        },
        GiftBagItem {
            bag_id: 1002,
            gift_id: 20003,
            gift_name: "小心心".to_string(),
            gift_num: 66,
        },
    ]
}

/// 获取直播间礼物面板列表（无需登录）
#[tauri::command]
pub async fn get_room_gifts(
    room_id: u64,
    state: State<'_, AppState>,
) -> Result<Vec<GiftConfig>, String> {
    ensure_enabled()?;
    if mock_active(room_id) {
        return Ok(mock_gifts());
    }
    let credential = get_sending_credential(state.inner()).await;
    let api = build_api_client(credential, &state);
    api.get_room_gifts(room_id).await
}

/// 获取礼物背包列表（需登录）
#[tauri::command]
pub async fn get_gift_bag(
    room_id: u64,
    state: State<'_, AppState>,
) -> Result<Vec<GiftBagItem>, String> {
    ensure_enabled()?;
    if mock_active(room_id) {
        return Ok(mock_bag());
    }
    let credential = get_sending_credential(state.inner()).await;
    let api = build_api_client(credential, &state);
    api.get_gift_bag(room_id).await
}

/// 获取瓜子余额（金瓜子/银瓜子）
#[tauri::command]
pub async fn get_gift_wallet(
    room_id: u64,
    state: State<'_, AppState>,
) -> Result<WalletInfo, String> {
    ensure_enabled()?;
    if mock_active(room_id) {
        return Ok(WalletInfo {
            gold: 9_999_000,
            silver: 888_888,
        });
    }
    let credential = get_sending_credential(state.inner()).await;
    let api = build_api_client(credential, &state);
    api.get_gift_wallet(room_id).await
}

/// 发送礼物（打赏）。
///
/// `bag_id > 0` 走背包不扣费；否则按 `coin_type`（gold 真实扣金瓜子 / silver 银瓜子）。
#[tauri::command]
pub async fn send_gift(
    room_id: u64,
    ruid: u64,
    gift_id: u64,
    gift_num: u32,
    bag_id: Option<u64>,
    coin_type: Option<String>,
    price: Option<u64>,
    state: State<'_, AppState>,
) -> Result<BiliResponse, String> {
    ensure_enabled()?;
    if mock_active(room_id) {
        return Ok(BiliResponse {
            code: 0,
            message: "虚拟直播间：礼物已假发送（未触网）".to_string(),
        });
    }
    let credential = get_sending_credential(state.inner()).await;
    let api = build_api_client(credential, &state);
    api.send_gift(
        room_id,
        ruid,
        gift_id,
        gift_num,
        bag_id.unwrap_or(0),
        coin_type.as_deref().unwrap_or("silver"),
        price.unwrap_or(0),
    )
    .await
}
