// PacketUtil.js

const DataPacket = require('./DataPacket');

const ACKPacket = require('./ACKPacket');


class PacketUtil {
    /**
     * 创建 ACK 数据包，返回对应的 DataPacket 实例
     * @param {MsgPacket} packet - 要确认的消息包
     * @returns {DataPacket} 返回构建的 ACK 数据包
     */
    static getAckMsg(packet) {
        let ackPacket = new ACKPacket();
        ackPacket.setSeqID(packet.getSeqID());

        return DataPacket.buildDataPacket(ackPacket);
        // let dataPacket = new DataPacket();
        // dataPacket.data = ackPacket;
        // return dataPacket;

    }

    /**
     * 检查请求包和 ACK 确认包是否匹配
     * @param {MsgPacket} req - 请求包
     * @param {MsgPacket} ack - ACK 确认包
     * @returns {boolean} 返回是否匹配
     */
    static isMatchAck(req, ack) {
        return req.getSeqID() === ack.getSeqID();
    }
}

module.exports = PacketUtil;
