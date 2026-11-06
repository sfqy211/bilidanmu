//! 礼物工具：只读列表 + 真实扣费发送。
//!
//! 送礼是 `Costly` 风险，在自主模式下会走确认通道；官方构建未编译 `gift-send`
//! 时全部返回 `FEATURE_DISABLED`。

use super::{api_with_main, api_with_sending, args};
use crate::ai::spec::ToolError;
use crate::ai::tools::classify_business_error;
use crate::AppState;

fn ensure_enabled() -> Result<(), ToolError> {
    if cfg!(feature = "gift-send") {
        Ok(())
    } else {
        Err(ToolError::new(
            "FEATURE_DISABLED",
            "本构建未启用礼物打赏功能（官方发布默认关闭，涉及真实扣费）",
        )
        .with_hint("这是编译期开关，运行时无法打开；向用户说明后放弃送礼"))
    }
}

fn resolve_room(raw: &serde_json::Value, state: &AppState) -> Result<u64, ToolError> {
    args::opt_u64(raw, "roomId")
        .or_else(|| super::current_room_id(state))
        .ok_or_else(ToolError::not_in_room)
}

/// 房间礼物面板列表（含价格与类型）。
pub async fn list(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    ensure_enabled()?;
    let room_id = resolve_room(raw, state)?;

    if room_id == crate::bili::mock::MOCK_ROOM_ID && crate::bili::mock::is_enabled() {
        return Ok(serde_json::json!({
            "roomId": room_id,
            "mock": true,
            "gifts": crate::commands::gift::mock_gifts(),
        }));
    }

    let api = api_with_main(state).await;
    let gifts = api
        .get_room_gifts(room_id)
        .await
        .map_err(classify_business_error)?;
    Ok(serde_json::json!({ "roomId": room_id, "count": gifts.len(), "gifts": gifts }))
}

/// 我的礼物背包（不扣费即可送）。
pub async fn bag(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    ensure_enabled()?;
    let room_id = resolve_room(raw, state)?;

    if room_id == crate::bili::mock::MOCK_ROOM_ID && crate::bili::mock::is_enabled() {
        return Ok(serde_json::json!({
            "roomId": room_id,
            "mock": true,
            "items": crate::commands::gift::mock_bag(),
        }));
    }

    let api = api_with_main(state).await;
    let items = api
        .get_gift_bag(room_id)
        .await
        .map_err(classify_business_error)?;
    Ok(serde_json::json!({ "roomId": room_id, "count": items.len(), "items": items }))
}

/// 发送礼物（金瓜子会真实扣费）。
pub async fn send(
    _app: &tauri::AppHandle,
    state: &AppState,
    raw: &serde_json::Value,
) -> Result<serde_json::Value, ToolError> {
    ensure_enabled()?;
    let room_id = resolve_room(raw, state)?;
    let gift_id = args::u64_required(raw, "giftId")?;
    let gift_num = args::capped(raw, "giftNum", 1, 1, 999) as u32;
    let coin_type = args::opt_string(raw, "coinType").unwrap_or_else(|| "silver".to_string());
    let price = args::opt_u64(raw, "price").unwrap_or(0);
    let bag_id = args::opt_u64(raw, "bagId");

    if coin_type == "gold" && price == 0 {
        return Err(ToolError::invalid_args(
            "金瓜子礼物必须提供 price（单价，1000 = 1 元），否则无法预估扣费",
        )
        .with_hint("从 gift_list 的返回里取 price 字段一并传入"));
    }

    // 主播 uid：参数优先，其次已保存房间记录
    let ruid = match args::opt_u64(raw, "ruid") {
        Some(uid) => uid,
        None => crate::room_store::load_rooms(state)
            .map_err(classify_business_error)?
            .into_iter()
            .find(|room| room.room_id == room_id)
            .and_then(|room| room.uid)
            .ok_or_else(|| {
                ToolError::invalid_args("拿不到主播 uid，请显式传 ruid")
                    .with_hint("真实房间需要主播 uid 才能送礼；可从 room_get 返回读取")
            })?,
    };

    if state.credential.lock().await.is_none() {
        return Err(ToolError::not_logged_in());
    }

    let total = price.saturating_mul(gift_num as u64);

    if room_id == crate::bili::mock::MOCK_ROOM_ID && crate::bili::mock::is_enabled() {
        return Ok(serde_json::json!({
            "sent": true,
            "roomId": room_id,
            "giftId": gift_id,
            "giftNum": gift_num,
            "coinType": coin_type,
            "totalPrice": total,
            "mock": true,
            "note": "虚拟直播间不真实扣费",
        }));
    }

    let api = api_with_sending(state).await;
    let response = api
        .send_gift(room_id, ruid, gift_id, gift_num, bag_id.unwrap_or(0), &coin_type, price)
        .await
        .map_err(classify_business_error)?;

    Ok(serde_json::json!({
        "sent": response.code == 0,
        "roomId": room_id,
        "giftId": gift_id,
        "giftNum": gift_num,
        "coinType": coin_type,
        "totalPrice": total,
        "totalYuan": (total as f64) / 1000.0,
        "code": response.code,
        "messageText": response.message,
    }))
}
