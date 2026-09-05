export function validateProvider(raw,execution) {
  if (!raw || !['openrouter','nvidia',...(execution==='local'?['ollama']:[])].includes(raw.id)) throw new Error('Unsupported provider for this runtime');
  if (typeof raw.model !== 'string' || !/^[a-zA-Z0-9._:/@+-]{1,120}$/.test(raw.model)) throw new Error('A valid model identifier is required');
  if (raw.id!=='ollama' && (typeof raw.apiKey!=='string' || raw.apiKey.length<8 || raw.apiKey.length>512 || /[\r\n]/.test(raw.apiKey))) throw new Error('A provider API key is required');
  return {id:raw.id,model:raw.model,apiKey:raw.id==='ollama'?'':raw.apiKey};
}
export async function modelAction(provider,observation,signal,maxTokens=512) {
  const urls={openrouter:'https://openrouter.ai/api/v1/chat/completions',nvidia:'https://integrate.api.nvidia.com/v1/chat/completions',ollama:'http://127.0.0.1:11434/v1/chat/completions'};
  const response=await fetch(urls[provider.id],{method:'POST',redirect:'error',signal,headers:{'content-type':'application/json',...(provider.apiKey?{authorization:'Bearer '+provider.apiKey}:{})},body:JSON.stringify({model:provider.model,max_tokens:Math.max(1,Math.min(512,maxTokens)),temperature:0.2,messages:[{role:'system',content:'Act in a bounded research environment. Return exactly one JSON object containing your action following the observation action schema. Never return code or markdown.'},{role:'user',content:JSON.stringify(observation)}]})});
  if(!response.ok) throw new Error('Provider request failed (HTTP '+response.status+')');
  const reader=response.body.getReader(); let text=''; let bytes=0;
  const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>65536){await reader.cancel();throw new Error('Provider response exceeded limit');}text+=decoder.decode(value,{stream:true});}
  let json,action;
  try {json=JSON.parse(text);action=JSON.parse(json.choices?.[0]?.message?.content);} catch {throw new Error('Provider returned invalid JSON action');}
  if (!action || typeof action!=='object' || Array.isArray(action) || JSON.stringify(action).length>4096) throw new Error('Provider action exceeded schema bounds');
  return {action,usage:{inputTokens:Number(json.usage?.prompt_tokens)||0,outputTokens:Number(json.usage?.completion_tokens)||512}};
}
