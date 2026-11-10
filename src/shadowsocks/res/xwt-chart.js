(function(root) {
    'use strict';
    var duration = 180000;
    var samples = [];
    var canvas, context, hoverTime = null;
    var uploadColor = '#55d9c5', downloadColor = '#65aaff';

    function formatRate(bytes) {
        var value = bytes * 8, units = ['bps', 'Kbps', 'Mbps', 'Gbps'], unit = 0;
        while (value >= 1000 && unit < units.length - 1) {
            value /= 1000;
            unit++;
        }
        return value.toFixed(unit ? 1 : 0) + ' ' + units[unit];
    }
    function prune(now) {
        while (samples.length && samples[0].time < now - duration) samples.shift();
    }
    function draw() {
        if (!canvas || !context) return;
        var now = Date.now();
        prune(now);
        var width = Math.max(1, canvas.clientWidth), height = 180;
        var ratio = Math.min(root.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        var left = 68, right = Math.max(left + 1, width - 12), top = 12, bottom = 150;
        var peakUp = 0, peakDown = 0, hasData = false;
        samples.forEach(function(sample) {
            if (sample.up !== null && sample.down !== null) hasData = true;
            if (sample.up !== null) peakUp = Math.max(peakUp, sample.up);
            if (sample.down !== null) peakDown = Math.max(peakDown, sample.down);
        });
        document.getElementById('xwt-peak-up').textContent = hasData ? formatRate(peakUp) : '—';
        document.getElementById('xwt-peak-down').textContent = hasData ? formatRate(peakDown) : '—';
        var maxRate = Math.max(125, peakUp, peakDown) * 1.15;
        context.font = '11px sans-serif';
        context.textAlign = 'right';
        context.textBaseline = 'middle';
        for (var row = 0; row <= 3; row++) {
            var y = top + (bottom - top) * row / 3;
            context.strokeStyle = 'rgba(225,235,238,0.14)';
            context.beginPath(); context.moveTo(left, y); context.lineTo(right, y); context.stroke();
            context.fillStyle = '#b8c7ca';
            context.fillText(formatRate(maxRate * (1 - row / 3)), left - 8, y);
        }
        context.textBaseline = 'alphabetic';
        context.fillStyle = '#b8c7ca';
        context.textAlign = 'left'; context.fillText('3 分钟前', left, height - 7);
        context.textAlign = 'center'; context.fillText('1 分 30 秒前', (left + right) / 2, height - 7);
        context.textAlign = 'right'; context.fillText('现在', right, height - 7);
        function line(key, color) {
            context.strokeStyle = color; context.lineWidth = 2;
            context.beginPath();
            var points = [];
            samples.forEach(function(sample) {
                if (sample[key] === null) return;
                var x = left + (sample.time - (now - duration)) / duration * (right - left);
                var y = bottom - sample[key] / maxRate * (bottom - top);
                points.push({x: x, y: y});
            });
            if (!points.length) return;
            context.moveTo(points[0].x, points[0].y);
            for (var i = 1; i < points.length - 1; i++) {
                context.quadraticCurveTo(points[i].x, points[i].y,
                    (points[i].x + points[i + 1].x) / 2,
                    (points[i].y + points[i + 1].y) / 2);
            }
            if (points.length > 1) context.lineTo(points[points.length - 1].x, points[points.length - 1].y);
            context.stroke();
        }
        line('up', uploadColor);
        line('down', downloadColor);
        var detail = document.getElementById('xwt-chart-detail');
        var nearest = null, distance = Infinity;
        if (hoverTime !== null) {
            samples.forEach(function(sample) {
                var delta = Math.abs(sample.time - hoverTime);
                if (sample.up !== null && sample.down !== null && delta < distance) {
                    nearest = sample; distance = delta;
                }
            });
        }
        if (nearest && distance < 8000) {
            var time = new Date(nearest.time).toLocaleTimeString();
            detail.textContent = time + '  上传 ' + formatRate(nearest.up) + '  下载 ' + formatRate(nearest.down);
        } else {
            detail.textContent = '将鼠标移到曲线上查看采样值';
        }
    }
    function init() {
        if (canvas) return;
        canvas = document.getElementById('xwt-chart');
        if (!canvas || !canvas.getContext) return;
        context = canvas.getContext('2d');
        canvas.addEventListener('mousemove', function(event) {
            var bounds = canvas.getBoundingClientRect();
            var left = 68, right = Math.max(left + 1, bounds.width - 12);
            hoverTime = Date.now() - duration + Math.max(0, Math.min(1, (event.clientX - bounds.left - left) / (right - left))) * duration;
            draw();
        });
        canvas.addEventListener('mouseleave', function() { hoverTime = null; draw(); });
        root.addEventListener('resize', draw);
        draw();
    }
    function add(up, down) {
        init();
        samples.push({time: Date.now(), up: up, down: down});
        prune(Date.now());
        draw();
    }
    root.XwtChart = {add: add, draw: function() { init(); draw(); }};
})(window);

