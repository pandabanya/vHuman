const pako = require("pako"); // 假设 DataPacket 已经实现

class SerialMsgPacket {
    static HANDSHAKE_REQ_TYPE = 0x01;
    static WIFI_CONF_TYPE = 0x02;
    static AIUI_CONF_TYPE = 0x03;
    static AIUI_PACKET_TYPE = 0x04;
    static CTR_PACKET_TYPE = 0x05;
    static ETH_CONF_TYPE = 0x06;
    static CUSTOM_PACKET_TYPE = 0x2A;

    static ACK_TYPE = 0xff;

    static RESERVED_DATA = [0xa5, 0x00, 0x00, 0x00];
    static TYPE_BIT = 2;

    static seqIDAchor = 0;

    msgType = SerialMsgPacket.ACK_TYPE
    content = ""

    constructor(msgType, content) {
        // 设置消息的唯一 ID
        this.seqID = SerialMsgPacket.seqIDAchor;
        this.msgType = msgType
        this.content = content
        SerialMsgPacket.seqIDAchor += 1;
        if (SerialMsgPacket.seqIDAchor > 65535) {
            SerialMsgPacket.seqIDAchor = 0;
        }
    }

    decodeContent() {
        // Convert binary string to character-number array
        // // unzip
        const data = pako.inflate(this.content);
        console.log('decodeContent', data);
        // Convert gunzipped byteArray back to ascii string:
        return String.fromCharCode.apply(null, new Uint16Array(data));
    }

    /**
     * 编码字节数组
     * @returns {Uint8Array} 编码后的字节数组
     */
    encodeBytes() {
        console.log('SerialMsgPacket encodeBytes', this.msgType, this.seqID, this.content)
        const content = this.content;
        const ret = new Uint8Array(3 + 2 + content.length);

        ret[0] = this.msgType;
        ret[1] = content.length & 0xff;
        ret[2] = (content.length >> 8) & 0xff;
        ret[3] = this.seqID & 0xff;
        ret[4] = (this.seqID >> 8) & 0xff;

        ret.set(content, 5);
        return ret;
    }

    /**
     * 解码字节数组
     * @param {Uint8Array} rawData 原始数据
     * @returns {SerialMsgPacket} 解码后的消息包
     */
    decodeBytes(rawData) {
        this.seqID = ((rawData[4] & 0xff) << 8) | (rawData[3] & 0xff);
        const length = ((rawData[2] & 0xff) << 8) | (rawData[1] & 0xff);
        const content = rawData.slice(5, 5 + length);
        this.decodeContent(content);
        return this;
    }

    /**
     * 获取消息 ID
     * @returns {number} 消息 ID
     */
    getSeqID() {
        return this.seqID;
    }

    /**
     * 设置消息 ID
     * @param {number} seqID 消息 ID
     */
    setSeqID(seqID) {
        this.seqID = seqID;
    }

    /**
     * 判断是否为请求类型
     * @returns {boolean} 是否为请求类型
     */
    isReqType() {
        return this.msgType !== SerialMsgPacket.ACK_TYPE;
    }
}

module.exports = SerialMsgPacket;
