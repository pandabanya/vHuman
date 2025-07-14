// FaceInfoPacket.js

const MsgPacket = require('./MsgPacket');

class FaceInfoPacket extends MsgPacket {
    constructor() {
        super();
        this.faceInfo = "";
    }

    // 返回消息类型
    getMsgType() {
        return MsgPacket.FACE_INFO_PACKET_TYPE;
    }

    // 获取内容，将 faceInfo 字符串转换为字节数组
    getContent() {
        return Buffer.from(this.faceInfo, 'utf-8');
    }

    // 解码内容，将字节数组转换为字符串并存入 faceInfo
    decodeContent(data) {
        this.faceInfo = data.toString('utf-8');
    }
}

module.exports = FaceInfoPacket;
