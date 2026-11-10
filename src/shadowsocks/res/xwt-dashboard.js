(function(root){
    'use strict';
    var timer=null, pending=null, generation=0, previous=null, previousTime=0;
    function bytes(n){
        var units=['B','KiB','MiB','GiB'],i=0;
        while(n>=1024&&i<units.length-1){n/=1024;i++;}
        return n.toFixed(i?1:0)+' '+units[i];
    }
    function bitsPerSecond(n){
        var units=['bps','Kbps','Mbps','Gbps'],i=0;
        n*=8;
        while(n>=1000&&i<units.length-1){n/=1000;i++;}
        return n.toFixed(i?1:0)+' '+units[i];
    }
    function active(){return !document.hidden && $('#tablet_11').is(':visible');}
    function stop(){generation++;if(timer!==null)clearTimeout(timer);timer=null;var xhr=pending;pending=null;if(xhr)xhr.abort();if(previous&&root.XwtChart)root.XwtChart.add(null,null);previous=null;}
    function start(){
        stop();var token=generation,healthy=false;
        if(root.XwtChart)root.XwtChart.draw();
        function again(started){if(token===generation&&active())timer=setTimeout(tick,healthy?Math.max(0,1000-(Date.now()-started)):5000);}
        function tick(){
            timer=null;if(token!==generation||!active())return;
            var started=Date.now();
            healthy=false;
            pending=$.ajax({type:'POST',url:'/_api/',dataType:'json',timeout:8000,
                data:JSON.stringify({id:Math.floor(Math.random()*100000000),method:'ss_dashboard.sh',params:[],fields:{}}),
                success:function(response){
                    if(token!==generation||!active())return;
                    try{
                        var s=FssLogViewer.decode(response.result),same=previous&&s.pid&&s.pid===previous.pid&&s.start_ticks===previous.start_ticks;
                        var ping=s.ping&&s.ping!=='unavailable'?(s.ping==='timeout'?' · ping 超时':' · '+Math.round(Number(s.ping))+' ms'):'';
                        $('#xwt-node').text((s.name||'未选择节点')+ping);
                        $('#xwt-type').text([s.kind,s.network].filter(Boolean).map(function(v){return String(v).toUpperCase();}).join(' / ')||'—');
                        $('#xwt-memory').text(s.pid?bytes(s.rss_kb*1024):'—');
                        var cpu=same&&s.total_ticks>previous.total_ticks?Math.max(0,(s.cpu_ticks-previous.cpu_ticks)/(s.total_ticks-previous.total_ticks)*s.cpus*100):null;
                        $('#xwt-cpu').text(!s.pid?'—':cpu===null?'采样中…':cpu.toFixed(1)+'%');
                        var elapsed=same?s.uptime-previous.uptime:0;
                        var traffic=s.traffic_available;
                        var wallElapsed=previousTime?(Date.now()-previousTime)/1000:0;
                        var valid=traffic&&same&&previous.traffic_available&&elapsed>=0.5&&elapsed<=5&&wallElapsed>=0.5&&wallElapsed<=5&&elapsed>=wallElapsed*0.5&&elapsed<=wallElapsed*2&&JSON.stringify(s.tags)===JSON.stringify(previous.tags)&&s.upload>=previous.upload&&s.download>=previous.download;
                        if(root.XwtChart){
                            root.XwtChart.add(valid?(s.upload-previous.upload)/elapsed:null,valid?(s.download-previous.download)/elapsed:null);
                        }
                        $('#xwt-up').text(valid?bitsPerSecond((s.upload-previous.upload)/elapsed):traffic?'采样中…':'统计不可用');
                        $('#xwt-down').text(valid?bitsPerSecond((s.download-previous.download)/elapsed):traffic?'采样中…':'统计不可用');
                        $('#xwt-total-up').text(traffic?bytes(s.upload):'统计不可用');
                        $('#xwt-total-down').text(traffic?bytes(s.download):'统计不可用');
                        $('#xwt-error').text('');
                        previous=s;
                        previousTime=Date.now();
                        healthy=true;
                    }catch(e){previous=null;previousTime=0;if(root.XwtChart)root.XwtChart.add(null,null);$('#xwt-error').text('状态数据读取失败，稍后重试');}
                },
                error:function(xhr,status){if(token===generation&&status!=='abort'){previous=null;previousTime=0;if(root.XwtChart)root.XwtChart.add(null,null);$('#xwt-error').text('状态读取失败，稍后重试');}},
                complete:function(){if(token===generation){pending=null;again(started);}}
            });
        }
        tick();
    }
    document.addEventListener('visibilitychange',function(){if(document.hidden)stop();else if(active())start();});
    window.addEventListener('beforeunload',stop);
    root.XwtDashboard={start:start,stop:stop};
})(window);
