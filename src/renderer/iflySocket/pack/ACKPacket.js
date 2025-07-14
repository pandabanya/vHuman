// ACKPacket.js

const MsgPacket = require('./MsgPacket');

class ACKPacket extends MsgPacket {

    // 获取消息类型，返回确认包类型
    getMsgType() {
        return MsgPacket.ACK_TYPE;
    }

    // 获取确认包内容，返回保留数据
    getContent() {
        return MsgPacket.RESERVED_DATA;
    }

    // 解码内容方法 (ACKPacket 无需内容解码)
    decodeContent(data) {
        // ACKPacket 没有解码操作
    }
}

module.exports = ACKPacket;
