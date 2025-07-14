// DataPacket.js

const Parser = require('./Parser');

class DataPacket {
    static SYNC_BYTE = 0xa5;
    static USER_BYTE = 0x01;
    static CHECK_CODE = 0x00;

    constructor() {
        this.sync = DataPacket.SYNC_BYTE;
        this.user = DataPacket.USER_BYTE;
        this.data = null;  // 用于存储 MsgPacket 实例
    }

    // 将数据写入输出流
    async writeToOutputStream(outputStream) {
        const syncUserBuffer = Buffer.from([this.sync, this.user]);
        const dataBuffer = this.data.encodeBytes();
        const checkCodeBuffer = Buffer.from([DataPacket.CHECK_CODE]);
        
        // 将所有部分合并为一个完整的 Buffer
        const finalBuffer = Buffer.concat([syncUserBuffer, dataBuffer, checkCodeBuffer]);

        // 写入输出流并刷新
        outputStream.write(finalBuffer);
        outputStream.flush();
        console.log("Output data:", Array.from(dataBuffer));
    }

    // 解码字节数组，解析数据包
    decodeBytes(rawData) {
        this.sync = rawData[0];
        this.user = rawData[1];
        const dataBytes = rawData.slice(2, rawData.length - 1);

        // 使用 PacketUtil 解析数据
        this.data = Parser.parse(dataBytes);
        if (this.data === null) {
            throw new Error("Decode Data Error");
        }

        return this.data;
    }

    // 校验数据包是否有效
    static isValid(data) {
        return DataPacket.CHECK_CODE === data[data.length - 1];
    }

    // 构建 DataPacket 实例
    static buildDataPacket(data) {
        let packet = new DataPacket();
        packet.data = data;
        return packet;
    }
}

module.exports = DataPacket;
