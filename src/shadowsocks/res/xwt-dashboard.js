(function(root){
    'use strict';
    var timer=null, pending=null, generation=0, previous=null;
    function bytes(n){
        var units=['B','KiB','MiB','GiB'],i=0;
        while(n>=1024&&i<units.length-1){n/=1024;i++;}
        return n.toFixed(i?1:0)+' '+units[i];
    }
    function active(){return !document.hidden && $('#tablet_11').is(':visible');}
    function stop(){generation++;if(timer!==null)clearTimeout(timer);timer=null;var xhr=pending;pending=null;if(xhr)xhr.abort();previous=null;}
    function start(){
        stop();var token=generation,nextDue=0,healthy=false;
        function again(){if(token===generation&&active())timer=setTimeout(tick,healthy?Math.max(0,nextDue-Date.now()):5000);}
        function tick(){
            timer=null;if(token!==generation||!active())return;
            nextDue=Date.now()+1000;healthy=false;
            pending=$.ajax({type:'POST',url:'/_api/',dataType:'json',timeout:8000,
                data:JSON.stringify({id:Math.floor(Math.random()*100000000),method:'ss_dashboard.sh',params:[],fields:{}}),
                success:function(response){
                    if(token!==generation||!active())return;
                    try{
                        var s=FssLogViewer.decode(response.result),same=previous&&s.pid&&s.pid===previous.pid&&s.start_ticks===previous.start_ticks;
                        $('#xwt-node').text(s.name||'未选择节点');
                        $('#xwt-type').text([s.kind,s.network].filter(Boolean).map(function(v){return String(v).toUpperCase();}).join(' / ')||'—');
                        $('#xwt-memory').text(s.pid?bytes(s.rss_kb*1024):'—');
                        var cpu=same&&s.total_ticks>previous.total_ticks?Math.max(0,(s.cpu_ticks-previous.cpu_ticks)/(s.total_ticks-previous.total_ticks)*s.cpus*100):null;
                        $('#xwt-cpu').text(!s.pid?'—':cpu===null?'采样中…':cpu.toFixed(1)+'%');
                        var elapsed=same?s.uptime-previous.uptime:0;
                        var traffic=s.traffic_available;
                        $('#xwt-up').text(traffic&&same&&elapsed>0&&s.upload>=previous.upload?bytes((s.upload-previous.upload)/elapsed)+'/s':traffic?'采样中…':'统计不可用');
                        $('#xwt-down').text(traffic&&same&&elapsed>0&&s.download>=previous.download?bytes((s.download-previous.download)/elapsed)+'/s':traffic?'采样中…':'统计不可用');
                        $('#xwt-total-up').text(traffic?'上传 '+bytes(s.upload):'上传统计不可用');
                        $('#xwt-total-down').text(traffic?'下载 '+bytes(s.download):'下载统计不可用');
                        $('#xwt-error').text('');
                        previous=s;
                        healthy=true;
                    }catch(e){$('#xwt-error').text('状态数据读取失败，稍后重试');}
                },
                error:function(xhr,status){if(token===generation&&status!=='abort')$('#xwt-error').text('状态读取失败，稍后重试');},
                complete:function(){if(token===generation){pending=null;again();}}
            });
        }
        tick();
    }
    document.addEventListener('visibilitychange',function(){if(document.hidden)stop();else if(active())start();});
    window.addEventListener('beforeunload',stop);
    root.XwtDashboard={start:start,stop:stop};
})(window);
