// HandShakePacket.js

const MsgPacket = require('./MsgPacket');

class HandShakePacket extends MsgPacket {
    // 返回消息类型
    getMsgType() {
        return MsgPacket.HANDSHAKE_REQ_TYPE;
    }

    // 获取内容，返回保留的数据
    getContent() {
        return MsgPacket.RESERVED_DATA;
    }

    // 解码内容，这里为空实现
    decodeContent(data) {
        // Handshake packet does not need to decode any content
    }
}

module.exports = HandShakePacket;
