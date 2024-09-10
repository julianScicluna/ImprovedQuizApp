class Sound {
    #active;
    #playCompletionPromiseRej;
    constructor(URL) {
        this.#playCompletionPromiseRej = null;
        this.#active = true;
        this.player = new Audio();
        this.player.src = URL;
    }
    async play(loop = false, duration = undefined, callback = () => {}) {
        if (duration != undefined) {
            setTimeout(function() {
                this.player.pause();
                callback();
            }, duration);
        }
        this.player.loop = loop;
        this.player.autoplay = true;
        await this.player.play();
    }
    pause() {
        this.player.autoplay = false;
        this.player.pause();
    }
    stop() {
        this.player.autoplay = false;
        this.player.pause();
        this.player.currentTime = 0;
        if (typeof playCompletionPromiseRej === "function") {
            //Reject any completion promises
            playCompletionPromiseRej();
            playCompletionPromiseRej = null;
        }
    }
    playAndAwaitCompletion() {
        if (typeof playCompletionPromiseRej === "null") {
            return this.play().then(function() {
                return new Promise(function(res, rej) {
                    playCompletionPromiseRej = rej;
                    this.player.onended = res;
                });
            });
        }
    }
    async playAndDestroy() {
        this.player.autoplay = true;
        await this.playAndAwaitCompletion();
        this.destroy();
    }
    destroy() {
        //Reject any promises
        this.stop();
        this.player.remove();
        this.player = null;
        this.#active = false;
    }
}

