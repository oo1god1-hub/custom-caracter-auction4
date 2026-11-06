const socket = io();
const $ = id => document.getElementById(id);
let myId = null;
let room = null;
let myRoomCode = null;
let timerInterval = null;

const views = ["homeView","roomView","auctionView","resultsView"];
function showView(id){ views.forEach(v=>$(v).classList.toggle("hidden",v!==id)); window.scrollTo(0,0); }
function money(n){ return Number(n||0).toLocaleString("en-IN"); }
function toast(message){ const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600); }
function setMessage(id,msg){ $(id).textContent=msg||""; }
function currentPlayer(){ return room?.players.find(p=>p.id===myId); }

socket.on("connect",()=>{myId=socket.id;$("connection").classList.add("online");$("connection").innerHTML="<span></span> Connected";});
socket.on("disconnect",()=>{$("connection").classList.remove("online");$("connection").innerHTML="<span></span> Reconnecting";});
socket.on("room:update",data=>{
  room=data;
  if(!myRoomCode) myRoomCode=data.code;
  if(data.status==="waiting") renderRoom();
  if(data.status==="auction") renderAuction();
  if(data.status==="finished") renderResults();
});

$("createBtn").onclick=()=>{
  setMessage("roomMessage","");
  socket.emit("room:create",{name:$("createName").value},res=>{
    if(!res?.ok)return toast(res?.error||"Could not create room.");
    myRoomCode=res.code;toast("Room created: "+res.code);
  });
};
$("joinBtn").onclick=()=>{
  const code=$("roomCode").value.trim().toUpperCase();
  socket.emit("room:join",{code,name:$("joinName").value},res=>{
    if(!res?.ok)return toast(res?.error||"Could not join room.");
    myRoomCode=res.code;toast("Joined room "+res.code);
  });
};
$("copyCode").onclick=async()=>{
  try{await navigator.clipboard.writeText(room.code);toast("Room code copied!");}
  catch{toast("Room code: "+room.code);}
};
$("startBtn").onclick=()=>socket.emit("auction:start",res=>{if(!res?.ok)toast(res?.error||"Could not start.");});
$("leaveBtn").onclick=()=>{socket.emit("room:leave");room=null;myRoomCode=null;showView("homeView");};
$("playAgainBtn").onclick=()=>{room=null;myRoomCode=null;showView("homeView");};
$("bidBtn").onclick=placeBid;
$("bidAmount").addEventListener("keydown",e=>{if(e.key==="Enter")placeBid();});
function placeBid(){
  const amount=Number($("bidAmount").value);
  socket.emit("bid:place",{amount},res=>{
    if(!res?.ok){setMessage("bidMessage",res?.error||"Bid failed.");}
    else{setMessage("bidMessage","Bid placed successfully.");$("bidAmount").value="";}
  });
}
function renderRoom(){
  showView("roomView");
  $("roomCodeLabel").textContent=room.code;$("shareCode").textContent=room.code;
  $("playerCount").textContent=`${room.players.length}/3`;
  $("roomStatus").textContent="WAITING";
  $("playersList").innerHTML=room.players.map((p,i)=>`
    <div class="player-row"><div class="avatar">${escapeHtml(p.name.slice(0,1).toUpperCase())}</div>
    <div><strong>${escapeHtml(p.name)}</strong><small>${p.id===myId?"You are here":"Ready to play"}</small></div>
    ${p.id===room.hostId?'<span class="host-tag">HOST</span>':""}</div>`).join("")+
    Array.from({length:3-room.players.length},()=>'<div class="player-row"><div class="avatar">+</div><div><strong>Waiting for player</strong><small>Share the room code</small></div></div>').join("");
  const isHost=room.hostId===myId;
  $("startBtn").classList.toggle("hidden",!isHost);
  $("startBtn").disabled=room.players.length<2;
  $("hostHint").textContent=isHost?(room.players.length<2?"Waiting for at least one more player.":"All set? Start the auction when ready."):"Waiting for the host to start the auction.";
  $("rosterGrid").innerHTML=room.characters.map(c=>`
    <div class="roster-card"><strong>${escapeHtml(c.name)}</strong><small class="tier-${c.tier}">${c.tier} • ${c.power} PWR</small><span class="price">${money(c.price)} coins</span>
    ${isHost?`<label class="upload-mini">＋ Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-char="${c.id}"></label>`:""}
    ${c.imageUrl?'<small>Image added ✓</small>':""}</div>`).join("");
  document.querySelectorAll('input[type="file"][data-char]').forEach(input=>input.addEventListener("change",()=>uploadImage(input.dataset.char,input.files[0])));
}
async function uploadImage(characterId,file){
  if(!file)return;
  if(file.size>5*1024*1024)return toast("Image must be 5 MB or smaller.");
  const form=new FormData();form.append("image",file);
  try{
    const response=await fetch(`/api/rooms/${room.code}/characters/${characterId}/image`,{method:"POST",headers:{"x-socket-id":myId},body:form});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||"Upload failed.");
    toast("Character image uploaded!");
  }catch(err){toast(err.message);}
}
function renderAuction(){
  showView("auctionView");
  const c=room.currentAuction;
  if(!c)return;
  const character=room.characters.find(x=>x.id===c.characterId);
  if(!character)return;
  const idx=room.characters.findIndex(x=>x.id===character.id);
  $("auctionProgress").textContent=`${String(idx+1).padStart(2,"0")} / 15`;
  $("progressBar").style.width=`${((idx+1)/15)*100}%`;
  $("tierBadge").textContent=character.tier;$("tierBadge").className=`tier-badge tier-${character.tier}`;
  $("rarityLabel").textContent=character.rarity.toUpperCase();
  $("characterName").textContent=character.name;
  $("characterDescription").textContent=character.description;
  $("characterPower").innerHTML=`${character.power}<span>/100</span>`;
  $("startingPrice").textContent=money(character.price);
  $("characterAbility").textContent=character.ability;
  $("highestBid").textContent=money(c.highestBid);
  const bidder=room.players.find(p=>p.id===c.highestBidderId);
  $("highestBidder").textContent=bidder?`Leading: ${bidder.name}`:"No bids yet — opening price";
  const art=$("characterArt");
  art.style.backgroundImage=character.imageUrl?`url("${character.imageUrl}")`:"";
  art.innerHTML=character.imageUrl?'<span class="art-label">CHARACTER</span>':'<div class="placeholder-symbol">✦</div><span class="art-label">CHARACTER</span>';
  $("bidAmount").min=c.highestBid+1;
  $("bidAmount").placeholder=`Minimum ${money(c.highestBid+1)}`;
  $("bidBtn").disabled=!currentPlayer()||currentPlayer().budget<=c.highestBid;
  $("auctionPlayers").innerHTML=room.players.map(p=>`
    <div class="budget-card"><strong>${escapeHtml(p.name)} ${p.id===myId?"(YOU)":""}</strong>
    <small>${p.characters.length} characters • ${p.totalPower} team power</small>
    <b>${money(p.budget)} <small>COINS LEFT</small></b></div>`).join("");
  $("historyList").innerHTML=room.history.length?room.history.slice().reverse().map(x=>`<div class="history-item">${escapeHtml(x)}</div>`).join(""):'<p class="hint">No bids yet.</p>';
  setMessage("bidMessage","");
  if(timerInterval)clearInterval(timerInterval);
  const updateTimer=()=>{
    const seconds=Math.max(0,Math.ceil((c.endsAt-Date.now())/1000));
    $("timer").textContent=seconds;
    $("timer").style.color=seconds<=5?"#fb7185":"#c4b5fd";
  };
  updateTimer();timerInterval=setInterval(updateTimer,250);
}
function renderResults(){
  if(timerInterval)clearInterval(timerInterval);
  showView("resultsView");
  const ranked=[...room.players].sort((a,b)=>b.totalPower-a.totalPower);
  const top=ranked[0];
  const tied=ranked.filter(p=>p.totalPower===top?.totalPower);
  $("winnerBanner").innerHTML=tied.length>1?
    `<div class="crown">⚖️</div><h2>IT'S A TIE!</h2><p>${tied.map(p=>escapeHtml(p.name)).join(" & ")} • ${top.totalPower} team power</p>`:
    `<div class="crown">🏆</div><h2>${escapeHtml(top?.name||"No winner")}</h2><p>AUCTION CHAMPION • ${top?.totalPower||0} TOTAL TEAM POWER</p>`;
  $("leaderboard").innerHTML=ranked.map((p,i)=>`
    <article class="leader-card"><div class="leader-head"><h3>${["🥇","🥈","🥉"][i]} ${escapeHtml(p.name)}</h3><strong>${p.totalPower} PWR</strong></div>
    <div class="team-chips">${p.characters.length?p.characters.map(c=>`<span class="team-chip">${escapeHtml(c.name)} • ${c.power} PWR • ${money(c.pricePaid)}</span>`).join(""):'<span class="team-chip">No characters purchased</span>'}</div>
    <p class="hint">Spent ${money(10000-p.budget)} coins • ${money(p.budget)} coins remaining • ${p.characters.length} characters</p></article>`).join("");
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
