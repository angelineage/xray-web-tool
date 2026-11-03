(function (root) {
    "use strict";
    function clean(text) {
        return String(text || "").split(/\r?\n/).filter(function (line) {
            return line.trim() !== "XU6J03M6";
        }).join("\n");
    }
    function create(options) {
        var generation = 0, timer = null, pending = null;
        function stop() {
            generation += 1;
            if (timer !== null) options.clearTimer(timer);
            timer = null;
            var old = pending;
            pending = null;
            if (old && old.abort) old.abort();
        }
        function start(view) {
            stop();
            var ticket = generation;
            function current() { return generation === ticket && options.isActive(); }
            function again(delay) {
                if (current()) timer = options.setTimer(tick, delay);
            }
            function tick() {
                timer = null;
                if (!current()) return;
                pending = options.request(view, function (snapshot) {
                    if (!current()) return;
                    pending = null;
                    if (!snapshot || snapshot.view !== view || typeof snapshot.text !== "string") {
                        options.error("日志响应无效，正在重试…");
                        again(3000);
                        return;
                    }
                    options.render(clean(snapshot.text), snapshot);
                    // A completed operation or unchanged log is still a live view.
                    again(1500);
                }, function () {
                    if (!current()) return;
                    pending = null;
                    options.error("读取日志失败，正在重试…");
                    again(3000);
                });
            }
            tick();
        }
        return {start:start, stop:stop};
    }
    var api = {create:create, clean:clean};
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.FssLogViewer = api;
}(typeof window === "undefined" ? this : window));
