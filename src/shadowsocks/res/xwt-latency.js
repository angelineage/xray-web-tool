(function(root){
    'use strict';
    var targets=[['抖音','国内','https://www.douyin.com/'],['微信','国内','https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico'],['淘宝','国内','https://www.taobao.com/'],['GitHub','国际','https://github.com/'],['X.com','国际','https://abs.twimg.com/favicons/twitter.3.ico'],['YouTube','国际','https://www.youtube.com/']];
    var timer=null,generation=0,controllers=[],inflight={},history=targets.map(function(){return [];});
    function record(i,ms){
        var samples=history[i];samples.push(ms);if(samples.length>30)samples.shift();
        var path=document.getElementById('xwt-site-path-'+i);if(!path)return;
        var valid=samples.filter(function(v){return v!==null;}),max=Math.max.apply(null,[500].concat(valid));
        var d='',open=false;
        samples.forEach(function(v,n){if(v===null){open=false;return;}var x=200*(30-samples.length+n)/29,y=55-50*Math.min(v/max,1);d+=(open?' L':' M')+x.toFixed(1)+','+y.toFixed(1);open=true;});
        path.setAttribute('d',d);
    }
    function stop(){generation++;if(timer!==null)clearTimeout(timer);timer=null;controllers.forEach(function(c){c.abort();});controllers=[];inflight={};}
    function start(){
        stop();var token=generation;
        function cycle(){
            if(token!==generation)return;
            targets.forEach(function(t,i){
                var value=document.getElementById('xwt-site-'+i);if(!value||inflight[i])return;inflight[i]=true;
                var controller=new AbortController(),started=performance.now();controllers.push(controller);
                var deadline=setTimeout(function(){controller.abort();},8000);
                var url=t[2]+(t[2].indexOf('?')<0?'?':'&')+'_xwt_probe='+Date.now();
                fetch(url,{mode:'no-cors',cache:'no-store',credentials:'omit',signal:controller.signal}).then(function(){
                    if(token!==generation)return;
                    var ms=Math.round(performance.now()-started);record(i,ms);value.textContent=ms+' ms';value.className='xwt-site-value '+(ms<200?'good':ms<500?'medium':'slow');
                }).catch(function(){if(token===generation){record(i,null);value.textContent='检测失败';value.className='xwt-site-value unavailable';}}).finally(function(){clearTimeout(deadline);if(token===generation)delete inflight[i];controllers=controllers.filter(function(c){return c!==controller;});});
            });
            timer=setTimeout(cycle,5000);
        }
        cycle();
    }
    root.XwtLatency={start:start,stop:stop};
})(window);
