import { createFileRoute } from "@tanstack/react-router";

const SCRIPT = String.raw`(function(){
var s=document.currentScript;if(!s)return;var key=s.getAttribute("data-key");if(!key)return;
var api=new URL(s.src).origin+"/api/public/v1/leads";var title=s.getAttribute("data-title")||"Get a free moving quote";
var color=s.getAttribute("data-color")||"";if(!/^#[0-9a-fA-F]{6}$/.test(color))color="#1d4ed8";var btnText=(s.getAttribute("data-button")||"Request quote").slice(0,40);var req=(s.getAttribute("data-required")||"").split(",");
var host=document.createElement("div");s.parentNode.insertBefore(host,s.nextSibling);
var root=host.attachShadow?host.attachShadow({mode:"open"}):host;
var css="*{box-sizing:border-box;font-family:system-ui,sans-serif}form{max-width:480px;padding:20px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;color:#0f172a;display:grid;gap:10px}h3{margin:0 0 4px;font-size:18px}input,textarea,select{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}button{padding:12px;border:0;border-radius:8px;color:#fff;font-weight:600;font-size:15px;cursor:pointer}.hp{position:absolute;left:-9999px}.msg{font-size:14px}@media(max-width:480px){.row{grid-template-columns:1fr}}";
root.innerHTML='<style>'+css+'</style><form><h3></h3><input name="name" placeholder="Full name" required maxlength="180"><div class="row"><input name="email" type="email" placeholder="Email" required><input name="phone" type="tel" placeholder="Phone"></div><input name="origin" placeholder="Pickup address"><input name="destination" placeholder="Drop-off address"><div class="row"><input name="moveDate" type="date"><select name="moveSize"><option value="">Bedrooms</option><option>Studio</option><option>1 bedroom</option><option>2 bedrooms</option><option>3 bedrooms</option><option>4+ bedrooms</option></select></div><textarea name="message" rows="3" placeholder="Anything else we should know?"></textarea><input class="hp" name="website" tabindex="-1" autocomplete="off"><button type="submit">Request quote</button><div class="msg" role="status"></div></form>';
var f=root.querySelector("form");f.querySelector("h3").textContent=title;var sb=f.querySelector("button");sb.style.background=color;sb.textContent=btnText;req.forEach(function(n){var el=f.querySelector("[name=\""+n.trim()+"\"]");if(el&&/^(phone|origin|destination|moveDate|moveSize)$/.test(n.trim()))el.required=true;});
var msg=f.querySelector(".msg");
f.addEventListener("submit",function(e){e.preventDefault();var b=f.querySelector("button");b.disabled=true;msg.textContent="Sending…";
var data={};new FormData(f).forEach(function(v,k){data[k]=String(v)});
var id=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2)).replace(/-/g,"");
fetch(api,{method:"POST",headers:{"Content-Type":"application/json","X-Widget-Key":key,"Idempotency-Key":id},body:JSON.stringify(data)})
.then(function(r){if(!r.ok)throw 0;f.innerHTML='<h3>Thank you!</h3><p class="msg">We received your request and will be in touch shortly.</p>'})
.catch(function(){b.disabled=false;msg.textContent="Something went wrong. Please try again or call us."});});
})();`;

export const Route = createFileRoute("/widget.js")({
  server: {
    handlers: {
      GET: async () => new Response(SCRIPT, {
        headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
      }),
    },
  },
});
