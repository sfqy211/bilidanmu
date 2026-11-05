//! 直播礼物相关数据模型（发送礼物 / 礼物面板 / 背包 / 瓜子余额）。

/// 礼物面板中的单个礼物配置（roomGiftList）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GiftConfig {
    /// 礼物 id
    pub id: u64,
    /// 礼物名
    pub name: String,
    /// 单价，金瓜子为 price/1000 元；银瓜子为瓜子数
    pub price: u64,
    /// gold 金瓜子 / silver 银瓜子
    pub coin_type: String,
    /// 礼物描述
    #[serde(default)]
    pub desc: String,
    /// 礼物图标
    #[serde(default)]
    pub img_basic: String,
}

/// 背包中的礼物条目（bag_list）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GiftBagItem {
    /// 背包条目 id，送礼时必填
    pub bag_id: u64,
    /// 礼物 id
    pub gift_id: u64,
    /// 礼物名
    pub gift_name: String,
    /// 持有数量
    pub gift_num: u32,
}

/// 用户瓜子余额（getInfoByUser 的 wallet 字段）。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletInfo {
    /// 金瓜子余额（1000 = 1 元）
    pub gold: u64,
    /// 银瓜子余额
    pub silver: u64,
}
