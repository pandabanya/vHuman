import AudioPlayer from "../player/index.umd";

export default class AnceStreamAudioPlayer{

    instance = null;
    audioPlayer = null
    playingCallback = null
    playStopCallback = null
    constructor(playingCb, playStopCb) {
        if (!AnceStreamAudioPlayer.instance) {
            AnceStreamAudioPlayer.instance = this;
            this.playingCallback = playingCb
            this.playStopCallback = playStopCb
            this.initPlayer()
            this.start()
        }
        return AnceStreamAudioPlayer.instance;
    }

    initPlayer() {
        this.audioPlayer = new AudioPlayer(".");
        this.audioPlayer.onPlay = () => {
            console.log('----play----')
            if (this.playingCallback) {
                this.playingCallback()
            }
        };
        this.audioPlayer.onStop = (audioDatas) => {
            console.log(audioDatas);
            console.log('----stop----')
            if (this.playStopCallback) {
                this.playStopCallback()
            }
        };
    }

    start() {
        this.audioPlayer.start({
            autoPlay: true,
            sampleRate: 16000,
            resumePlayDuration: 1000    // 已经接收到的音频数据播放完，后续需要播放的数据还没有来到，需要延时多长时间继续播放，单位为ms, <=0 时不自动播放后续的音频数据
        });
    }

    receiveData(audioData, isLastData) {
        console.log('stream player receiveData')
        this.audioPlayer.postMessage({
            type: "base64",
            data: audioData,
            isLastData: isLastData,
        });
    }


}