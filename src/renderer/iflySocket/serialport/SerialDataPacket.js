// DataPacket.js
const Parser = require('../pack/Parser')

class SerialDataPacket {
    SYNC_BYTE = 0xa5; // 同步字节
    USER_BYTE = 0x01; // 用户字节

    /**
     * 数据包格式: | SYNC | USER | DATA | CheckCode
     */
    constructor(data = null) {
        this.sync = this.SYNC_BYTE;
        this.user = this.USER_BYTE;
        this.data = data;
        this.checkCode = 0;
    }

    // 将数据编码成字节数组
    encodeBytes() {
        const dataBytes = this.data.encodeBytes(); // MsgPacket 的 encodeBytes 方法需实现
        console.log("SerialDataPacket encodeBytes", dataBytes)
        const ret = new Uint8Array(dataBytes.length + 3);
        ret[0] = this.sync;
        ret[1] = this.user;
        ret.set(dataBytes, 2);
        this.checkCode = SerialDataPacket.calCheckCode(ret, 0, ret.length - 2);
        ret[ret.length - 1] = this.checkCode;
        return ret;
    }

    // 解码字节数组并构建 DataPacket
     static decodeBytes(rawData) {
        if (rawData[0] !== this.SYNC_BYTE) {
            throw new Error("Invalid sync byte");
        }
        const packet = new SerialDataPacket();
        packet.sync = rawData[0];
        packet.user = rawData[1];
        const dataBytes = rawData.slice(2, rawData.length - 1);
        packet.data = Parser.parse(dataBytes); // MsgPacket 的 parse 方法需实现
        if (!packet.data) {
            throw new Error("Decode Data Error");
        }
        packet.checkCode = rawData[rawData.length - 1];
        return packet;
    }

    // 校验数据的合法性
    static isValid(data) {
        return SerialDataPacket.calCheckCode(data, 0, data.length - 2) === data[data.length - 1];
    }

    // 计算校验码
    static calCheckCode(data, start, end) {
        let sum = 0;
        for (let i = start; i <= end; i++) {
            sum += data[i];
        }
        return ((~(sum & 0xff) + 1) & 0xff);
    }

    // 构建 DataPacket 实例
    static buildDataPacket(data) {
        return new SerialDataPacket(data);
    }
}

module.exports = SerialDataPacket

