

class PacketEntity {
    isHasAcked = false
    retryCount = 0
    lastSendTime = 0
    isNeedAck = false
    dataPacket = null
    callback = null

    constructor(dataPacket, callback) {
        this.dataPacket = dataPacket
        this.callback = callback
        this.isNeedAck = true
        this.lastSendTime = 0
    }

    increaseRetryCount(){
        this.retryCount += 1;
    }

    resetRetryCount(){
        this.retryCount = 0;
    }

    onSuccess(){
        if(this.callback != null){
            this.callback.onSuccess();
        }
    }

    onFailed(error) {
        if(this.callback) {
            this.callback.onFailed(error)
        }
    }
}

module.exports = PacketEntity

