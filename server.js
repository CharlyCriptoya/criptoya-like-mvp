import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const __filename=fileURLToPath(import.meta.url),__dirname=path.dirname(__filename);
const app=express();app.use(express.json({limit:"2mb"}));app.use(express.static(__dirname));

app.get("/api/klines",async(req,res)=>{try{const{symbol="BTCUSDT",interval="5m",limit=500}=req.query;
const url=`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
const r=await fetch(url);const raw=await r.json();
res.json(raw.map(k=>({t:Math.floor(k[0]/1000),o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5]})));
}catch(e){res.status(500).json({error:e.message});}});

app.get("/api/ticker24h",async(req,res)=>{try{const{symbol="BTCUSDT"}=req.query;
const url=`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
const r=await fetch(url);res.json(await r.json());
}catch(e){res.status(500).json({error:e.message});}});

app.post("/api/analyze",async(req,res)=>{try{if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:"Falta OPENAI_API_KEY"});
const{symbol,interval,candles=[],user_note=""}=req.body;if(!candles.length)return res.status(400).json({error:"Sin velas"});
const last=candles.at(-1);
const system="Sos un analista técnico educativo. No des consejos financieros, solo análisis técnico en español con bullets.";
const user=`Par:${symbol} Intervalo:${interval} Última vela O:${last.o} H:${last.h} L:${last.l} C:${last.c} Notas:${user_note}`;
const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
body:JSON.stringify({model:"gpt-4o-mini",temperature:0.25,messages:[{role:"system",content:system},{role:"user",content:user}]})});
const j=await r.json();res.json({text:j.choices?.[0]?.message?.content||"Sin respuesta"});
}catch(e){res.status(500).json({error:e.message});}});

app.get("/health",(_,res)=>res.send("ok"));
const PORT=process.env.PORT||3000;app.listen(PORT,()=>console.log("Server en http://localhost:"+PORT));
