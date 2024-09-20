class Sound {
    #active;
    #playerStopHandlers;
    constructor(URL) {
        this.#playerStopHandlers = [];
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
            while (this.#playerStopHandlers.length > 0) {
                if (typeof this.#playerStopHandlers[0] === "function") {
                    this.#playerStopHandlers[0]();
                    this.#playerStopHandlers.shift();
                }
            }
        }
    }
    playAndAwaitCompletion() {
        return this.play().then((function() {
            return new Promise((function(res, rej) {
                this.#playerStopHandlers.push(rej);
                let playerEndHandler = (function() {
                    this.player.removeEventListener("ended", playerEndHandler);
                    this.#playerStopHandlers.splice(this.#playerStopHandlers.indexOf(rej), 1);
                    res();
                }).bind(this);
                this.player.addEventListener("ended", playerEndHandler);
            }).bind(this));
        }).bind(this));
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

