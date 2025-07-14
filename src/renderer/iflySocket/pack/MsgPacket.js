// MsgPacket.js

class MsgPacket {
    // 定义静态常量
    static HANDSHAKE_REQ_TYPE = 0x01;
    static VIDEO_FRAME_PACKET_TYPE = 0x08;
    static VIDEO_FRAME_INFO_PACKET_TYPE = 0x07;
    static FACE_INFO_PACKET_TYPE = 0x09;
    static AUDIO_FRAME_PACKET_TYPE = 0x0a;
    static FACE_INFO_LIST_PACKET_TYPE = 0x0b;
    static ACK_TYPE = 0xff;
    static SYNC_BYTE = 0xa5;

    static RESERVED_DATA = Buffer.from([MsgPacket.SYNC_BYTE, 0x00, 0x00, 0x00]);
    static TYPE_BIT = 2;

    static seqIDAchor = 0;

    constructor() {
        if (this.getMsgType() !== MsgPacket.ACK_TYPE) {
            this.increaseSeqId();
        }
        this.seqID = 0;
    }

    // 增加消息ID
    increaseSeqId() {
        MsgPacket.seqIDAchor += 1;
        this.seqID = MsgPacket.seqIDAchor;
        if (MsgPacket.seqIDAchor > 65535) {
            MsgPacket.seqIDAchor = 0;
        }
    }

    // 获取消息类型
    getMsgType() {
        throw new Error("getMsgType() must be implemented by subclasses");
    }

    // 获取内容，子类需要实现
    getContent() {
        throw new Error("getContent() must be implemented by subclasses");
    }

    // 解码内容，子类需要实现
    decodeContent(data) {
        throw new Error("decodeContent() must be implemented by subclasses");
    }

    // 编码成字节数组
    encodeBytes() {
        const content = this.getContent();
        const ret = Buffer.alloc(3 + 4 + content.length);
        
        ret[0] = this.getMsgType();
        ret[1] = content.length & 0xff;
        ret[2] = (content.length >> 8) & 0xff;
        ret[3] = (content.length >> 16) & 0xff;
        ret[4] = (content.length >> 24) & 0xff;
        ret[5] = this.seqID & 0xff;
        ret[6] = (this.seqID >> 8) & 0xff;

        content.copy(ret, 7);
        return ret;
    }

    // 解码字节数组
    decodeBytes(rawData) {
        this.seqID = (rawData[6] << 8) | rawData[5];
        const length = (rawData[4] << 24) | (rawData[3] << 16) | (rawData[2] << 8) | rawData[1];
        const content = rawData.slice(7, 7 + length);
        
        this.decodeContent(content);
        return this;
    }

    // 获取消息ID
    getSeqID() {
        return this.seqID;
    }

    // 设置消息ID
    setSeqID(seqID) {
        this.seqID = seqID;
    }

    // 判断是否为请求类型
    isReqType() {
        return this.getMsgType() !== MsgPacket.ACK_TYPE;
    }
}

module.exports = MsgPacket;
