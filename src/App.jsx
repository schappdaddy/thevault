import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from './supabase'

const CATEGORIES = ['Baseball Card','Bobblehead','Print','Autograph Baseball','Jersey','Bat','Helmet','Photo','Poster','Figurine','Other']
const CONDITIONS = ['Mint','Near Mint','Excellent','Very Good','Good','Fair','Poor']
const GRADERS    = ['','PSA','BGS','SGC','JSA','BAS','Other']

const EMPTY = {
  name:'', year:'', category:'Baseball Card', player:'', team:'',
  manufacturer:'', condition:'Near Mint', grading_service:'', grade_score:'',
  market_value:'', purchase_price:'', purchase_date:'', serial_number:'', notes:''
}

const CAT_EMOJI = {
  'Baseball Card':'🃏','Bobblehead':'🪆','Autograph Baseball':'⚾',
  'Jersey':'👕','Bat':'🏏','Helmet':'⛑️','Print':'🖼️',
  'Photo':'📷','Poster':'📜','Figurine':'🏆','Other':'📦'
}
const CAT_COLOR = {
  'Baseball Card':'#4ECDC4','Bobblehead':'#FF6B6B','Print':'#C77DFF',
  'Autograph Baseball':'#D4AF37','Jersey':'#45B7D1','Bat':'#96CEB4',
  'Helmet':'#FFEAA7','Photo':'#A8DADC','Poster':'#F4A261',
  'Figurine':'#E76F51','Other':'#7A8B9A'
}

const fmt = v => (!v && v !== 0) ? '—' : '$' + Number(v).toLocaleString()

const inp = {
  background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)',
  borderRadius:8, color:'#F0E6C8', padding:'10px 14px', fontSize:14,
  fontFamily:"'Space Mono',monospace", outline:'none', width:'100%', transition:'border-color 0.2s',
}
const lbl = {
  fontSize:11, color:'#7A8B9A', letterSpacing:1.5, textTransform:'uppercase',
  fontFamily:"'Space Mono',monospace", marginBottom:5, display:'block',
}
const card = {
  background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'14px 18px',
}

function Badge({ text, color='#7A8B9A' }) {
  return <span style={{ background:`${color}20`, color, border:`1px solid ${color}40`, borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:600, letterSpacing:0.5, whiteSpace:'nowrap', fontFamily:"'Space Mono',monospace" }}>{text}</span>
}

function Spinner({ label='Loading…' }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:'32px 0' }}>
      <div style={{ width:36, height:36, borderRadius:'50%', border:'3px solid rgba(212,175,55,0.2)', borderTop:'3px solid #D4AF37', animation:'spin 0.8s linear infinite' }} />
      <p style={{ color:'#D4AF37', fontSize:13, fontFamily:"'Space Mono',monospace", letterSpacing:1, margin:0 }}>{label}</p>
    </div>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ ...card, flex:1, minWidth:130 }}>
      <div style={{ fontSize:10, color:'#7A8B9A', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:700, color:accent||'#F0E6C8', fontFamily:"'Playfair Display',serif" }}>{value}</div>
    </div>
  )
}

function PasswordGate({ onUnlock }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const correct = import.meta.env.VITE_VAULT_PASSWORD

  function handleSubmit(e) {
    e.preventDefault()
    if (pw === correct) {
      sessionStorage.setItem('vault_unlocked', '1')
      onUnlock()
    } else {
      setError('Incorrect password')
      setPw('')
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0A0F1C 0%,#111827 50%,#0D1520 100%)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', padding:40, maxWidth:360, width:'100%' }}>
        <div style={{ width:56, height:56, borderRadius:14, background:'linear-gradient(135deg,#D4AF37,#A0832A)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 20px' }}>⚾</div>
        <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:28, marginBottom:6, color:'#F0E6C8' }}>The Vault</h1>
        <p style={{ color:'#7A8B9A', fontSize:13, marginBottom:32, fontFamily:"'Space Mono',monospace" }}>MEMORABILIA REGISTRY</p>
        <form onSubmit={handleSubmit}>
          <input type="password" value={pw} onChange={e=>{ setPw(e.target.value); setError('') }}
            placeholder="Enter password" autoFocus
            style={{ ...inp, marginBottom:12, textAlign:'center', fontSize:16, letterSpacing:4 }} />
          {error && <div style={{ color:'#FF6B6B', fontSize:12, marginBottom:12, fontFamily:"'Space Mono',monospace" }}>{error}</div>}
          <button type="submit" style={{ width:'100%', background:'linear-gradient(135deg,#D4AF37,#A0832A)', color:'#0A0F1C', border:'none', borderRadius:10, padding:'12px', fontSize:14, fontWeight:700, fontFamily:"'Space Mono',monospace", cursor:'pointer' }}>Unlock</button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [unlocked, setUnlocked] = useState(!!sessionStorage.getItem('vault_unlocked'))
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />
  return <Vault />
}
function Vault() {
  const [items,        setItems]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [view,         setView]         = useState('gallery')
  const [selected,     setSelected]     = useState(null)
  const [form,         setForm]         = useState(EMPTY)
  const [editingId,    setEditingId]    = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageFile,    setImageFile]    = useState(null)
  const [aiLoading,    setAiLoading]    = useState(false)
  const [aiError,      setAiError]      = useState('')
  const [aiHints,      setAiHints]      = useState('')
  const [saving,       setSaving]       = useState(false)
  const [filterCat,    setFilterCat]    = useState('All')
  const [searchQ,      setSearchQ]      = useState('')
  const [sortBy,       setSortBy]       = useState('created_at')
  const [refreshing,   setRefreshing]   = useState(false)
  const [refreshResult,setRefreshResult]= useState(null)
  const [grading,      setGrading]      = useState(false)
  const [gradingResult,setGradingResult]= useState(null)
  const fileRef = useRef()

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    setLoading(true)
    const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending:false })
    if (!error) setItems(data || [])
    setLoading(false)
  }

  const totalValue = items.reduce((s,i) => s + (Number(i.market_value)||0), 0)
  const totalCost  = items.reduce((s,i) => s + (Number(i.purchase_price)||0), 0)

  const filtered = items
    .filter(i => filterCat==='All' || i.category===filterCat)
    .filter(i => { const q=searchQ.toLowerCase(); return !q||[i.name,i.player,i.team].some(f=>f?.toLowerCase().includes(q)) })
    .sort((a,b) => {
      if (sortBy==='market_value') return (Number(b.market_value)||0)-(Number(a.market_value)||0)
      if (sortBy==='year') return (b.year||'').localeCompare(a.year||'')
      if (sortBy==='name') return (a.name||'').localeCompare(b.name||'')
      return new Date(b.created_at)-new Date(a.created_at)
    })

  const handleImageUpload = useCallback(async (file) => {
    if (!file) return
    setImageFile(file)
    setAiLoading(true)
    setAiError('')
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      setImagePreview(dataUrl)
      const img = new Image()
      img.src = dataUrl
      await new Promise((resolve, reject) => { img.onload=resolve; img.onerror=reject; setTimeout(reject,10000) })
      const canvas = document.createElement('canvas')
      const MAX = 1200
      const scale = Math.min(MAX/img.width, MAX/img.height, 1)
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      const compressed = canvas.toDataURL('image/jpeg', 0.85)
      const base64 = compressed.split(',')[1]
      const hintsText = aiHints.trim() ? `\n\nIMPORTANT additional context from the collector: ${aiHints.trim()}` : ''
      const res = await fetch('/api/analyze', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ imageData:base64, mediaType:'image/jpeg', hints:hintsText })
      })
      if (!res.ok) { const e=await res.json(); throw new Error(e.error||`Error ${res.status}`) }
      const parsed = await res.json()
      setForm(prev => ({
        ...prev, ...parsed,
        market_value:    parsed.marketValue    ?? parsed.market_value    ?? '',
        grading_service: parsed.gradingService ?? parsed.grading_service ?? '',
        grade_score:     parsed.gradeScore     ?? parsed.grade_score     ?? '',
        serial_number:   parsed.serialNumber   ?? parsed.serial_number   ?? '',
        purchase_price:  prev.purchase_price,
        purchase_date:   prev.purchase_date,
      }))
    } catch(err) { setAiError(`Analysis failed: ${err.message}`) }
    setAiLoading(false)
  }, [aiHints])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleImageUpload(file)
  }, [handleImageUpload])

  async function handleSave() {
    if (!form.name) return
    setSaving(true)
    try {
      let image_url = form.image_url || null
      let image_path = form.image_path || null
      if (imageFile) {
        const ext = imageFile.name.split('.').pop()
        const path = `${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage.from('vault-images').upload(path, imageFile, { upsert:true })
        if (!uploadError) {
          const { data:urlData } = supabase.storage.from('vault-images').getPublicUrl(path)
          image_url = urlData.publicUrl
          image_path = path
        }
      }
      const payload = {
        name:form.name, year:form.year||null, category:form.category||null,
        player:form.player||null, team:form.team||null, manufacturer:form.manufacturer||null,
        condition:form.condition||null, grading_service:form.grading_service||null,
        grade_score:form.grade_score||null,
        market_value:form.market_value ? Number(form.market_value) : null,
        purchase_price:form.purchase_price ? Number(form.purchase_price) : null,
        purchase_date:form.purchase_date||null, serial_number:form.serial_number||null,
        notes:form.notes||null, image_url, image_path,
      }
      if (editingId) { await supabase.from('items').update(payload).eq('id',editingId) }
      else { await supabase.from('items').insert(payload) }
      await fetchItems(); resetForm(); setView('gallery')
    } catch(err) { alert('Save failed: '+err.message) }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Remove this item from The Vault?')) return
    const item = items.find(i=>i.id===id)
    if (item?.image_path) await supabase.storage.from('vault-images').remove([item.image_path])
    await supabase.from('items').delete().eq('id',id)
    await fetchItems()
    if (selected?.id===id) { setSelected(null); setView('gallery') }
  }

  function handleEdit(item) {
    setForm({...EMPTY,...item}); setImagePreview(item.image_url||null)
    setImageFile(null); setEditingId(item.id); setView('add')
  }

  function resetForm() {
    setForm(EMPTY); setImagePreview(null); setImageFile(null)
    setEditingId(null); setAiError(''); setAiHints('')
  }

  async function handleRefresh(item) {
    setRefreshing(true); setRefreshResult(null)
    try {
      const res = await fetch('/api/refresh', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(item) })
      if (!res.ok) throw new Error('Refresh failed')
      const data = await res.json()
      setRefreshResult({ ...data, itemId:item.id, oldValue:item.market_value })
    } catch(err) { alert('Refresh failed: '+err.message) }
    setRefreshing(false)
  }

  async function applyRefresh() {
    if (!refreshResult) return
    await supabase.from('items').update({ market_value:refreshResult.marketValue }).eq('id',refreshResult.itemId)
    await fetchItems()
    if (selected?.id===refreshResult.itemId) setSelected(prev=>({...prev, market_value:refreshResult.marketValue}))
    setRefreshResult(null)
  }

  async function handleGradeAdvisor(item) {
    setGrading(true); setGradingResult(null)
    try {
      const res = await fetch('/api/grade', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(item) })
      if (!res.ok) throw new Error('Grading analysis failed')
      setGradingResult(await res.json())
    } catch(err) { alert('Grading analysis failed: '+err.message) }
    setGrading(false)
  }

  const verdictColor = v => v==='Worth Grading'?'#96CEB4':v==='Not Worth Grading'?'#FF6B6B':'#D4AF37'

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0A0F1C 0%,#111827 50%,#0D1520 100%)', color:'#F0E6C8' }}>
      <div style={{ borderBottom:'1px solid rgba(212,175,55,0.15)', padding:'0 20px', paddingTop:'env(safe-area-inset-top)', display:'flex', alignItems:'center', justifyContent:'space-between', height:'calc(60px + env(safe-area-inset-top))', background:'rgba(0,0,0,0.4)', backdropFilter:'blur(16px)', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#D4AF37,#A0832A)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>⚾</div>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontWeight:700, fontSize:17, lineHeight:1 }}>The Vault</div>
            <div style={{ fontSize:9, color:'#7A8B9A', letterSpacing:2, textTransform:'uppercase', fontFamily:"'Space Mono',monospace" }}>Memorabilia Registry</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {[['gallery','Gallery'],['table','List'],['deal','🔍 Deal'],['add','+ Add']].map(([v,label]) => (
            <button key={v} onClick={()=>{ if(v==='add') resetForm(); setView(v) }}
              style={{ background:view===v?'rgba(212,175,55,0.15)':'transparent', color:view===v?'#D4AF37':'#7A8B9A', border:view===v?'1px solid rgba(212,175,55,0.3)':'1px solid transparent', borderRadius:8, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:"'Space Mono',monospace", transition:'all 0.2s' }}>{label}</button>
          ))}
          <button onClick={()=>{ sessionStorage.removeItem('vault_unlocked'); window.location.reload() }}
            style={{ background:'transparent', color:'#7A8B9A', border:'1px solid transparent', borderRadius:8, padding:'6px 10px', fontSize:12, cursor:'pointer' }}>🔒</button>
        </div>
      </div>

      <div style={{ padding:'20px', paddingBottom:'calc(20px + env(safe-area-inset-bottom))', maxWidth:1400, margin:'0 auto' }}>
        <div style={{ display:'flex', gap:12, marginBottom:24, flexWrap:'wrap' }}>
          <StatCard label="Items"            value={items.length} />
          <StatCard label="Collection Value" value={fmt(totalValue)}           accent="#D4AF37" />
          <StatCard label="Invested"         value={fmt(totalCost)}            accent="#4ECDC4" />
          <StatCard label="Gain"             value={fmt(totalValue-totalCost)} accent={totalValue-totalCost>=0?'#96CEB4':'#FF6B6B'} />
        </div>

        {loading && <Spinner label="Loading your vault…" />}
{/* GALLERY */}
        {!loading && view==='gallery' && (
          <div className="fade-in">
            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
              <input placeholder="Search…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{ ...inp, width:180, padding:'8px 12px', fontSize:13 }} />
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ ...inp, width:'auto', padding:'8px 10px', fontSize:12 }}>
                <option value="created_at">Recently Added</option>
                <option value="market_value">Highest Value</option>
                <option value="year">Year</option>
                <option value="name">Name</option>
              </select>
            </div>
            <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' }}>
              {['All',...CATEGORIES].map(c=>(
                <button key={c} onClick={()=>setFilterCat(c)} style={{ background:filterCat===c?'rgba(212,175,55,0.15)':'transparent', color:filterCat===c?'#D4AF37':'#7A8B9A', border:filterCat===c?'1px solid rgba(212,175,55,0.4)':'1px solid rgba(255,255,255,0.1)', borderRadius:20, padding:'4px 12px', fontSize:11, cursor:'pointer', fontFamily:"'Space Mono',monospace", transition:'all 0.2s' }}>{c}</button>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:16 }}>
              {filtered.map(item=>(
                <div key={item.id} onClick={()=>{ setSelected(item); setView('detail') }}
                  style={{ background:'linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, overflow:'hidden', cursor:'pointer', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)' }}
                  onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 20px 40px rgba(0,0,0,0.4)' }}
                  onMouseLeave={e=>{ e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='' }}>
                  <div style={{ height:160, background:item.image_url?`url(${item.image_url}) center/cover no-repeat`:'rgba(255,255,255,0.02)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:48, position:'relative' }}>
                    {!item.image_url&&(CAT_EMOJI[item.category]||'📦')}
                    <div style={{ position:'absolute', top:8, right:8 }}><Badge text={item.category} color={CAT_COLOR[item.category]} /></div>
                  </div>
                  <div style={{ padding:'12px 14px' }}>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontWeight:600, fontSize:14, marginBottom:3, lineHeight:1.3 }}>{item.name}</div>
                    <div style={{ fontSize:11, color:'#7A8B9A', fontFamily:"'Space Mono',monospace", marginBottom:8 }}>{[item.player,item.year].filter(Boolean).join(' · ')}</div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ fontSize:17, fontWeight:700, color:'#D4AF37', fontFamily:"'Playfair Display',serif" }}>{fmt(item.market_value)}</div>
                      {item.grading_service&&item.grade_score&&<Badge text={`${item.grading_service} ${item.grade_score}`} color="#4ECDC4" />}
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length===0&&<div style={{ gridColumn:'1/-1', textAlign:'center', padding:'60px 0', color:'#7A8B9A' }}><div style={{ fontSize:48, marginBottom:12 }}>🏟️</div><div style={{ fontFamily:"'Playfair Display',serif", fontSize:20 }}>No items found</div></div>}
            </div>
          </div>
        )}

        {/* TABLE */}
        {!loading && view==='table' && (
          <div className="fade-in">
            <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
              <input placeholder="Search…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{ ...inp, width:200, padding:'8px 12px', fontSize:13 }} />
              <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{ ...inp, width:'auto', fontSize:12 }}>
                <option value="All">All Categories</option>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
              <div style={{ marginLeft:'auto', fontSize:11, color:'#7A8B9A', fontFamily:"'Space Mono',monospace" }}>{filtered.length} items · {fmt(totalValue)}</div>
            </div>
            <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid rgba(255,255,255,0.08)' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'rgba(212,175,55,0.08)', borderBottom:'1px solid rgba(212,175,55,0.15)' }}>
                    {['Item','Category','Player','Year','Condition','Grade','Market Value','Paid','Gain/Loss',''].map(h=>(
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, letterSpacing:1.5, textTransform:'uppercase', color:'#D4AF37', fontFamily:"'Space Mono',monospace", whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item=>{
                    const gain=(Number(item.market_value)||0)-(Number(item.purchase_price)||0)
                    const hasCost=!!item.purchase_price
                    return (
                      <tr key={item.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.05)', cursor:'pointer' }}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                        <td style={{ padding:'10px 14px', fontFamily:"'Playfair Display',serif", fontWeight:600, fontSize:13 }} onClick={()=>{ setSelected(item); setView('detail') }}>{item.name}</td>
                        <td style={{ padding:'10px 14px' }}><Badge text={item.category} color={CAT_COLOR[item.category]} /></td>
                        <td style={{ padding:'10px 14px', color:'#C0AE8A', whiteSpace:'nowrap' }}>{item.player||'—'}</td>
                        <td style={{ padding:'10px 14px', fontFamily:"'Space Mono',monospace", color:'#7A8B9A' }}>{item.year||'—'}</td>
                        <td style={{ padding:'10px 14px' }}>{item.condition?<Badge text={item.condition} color="#7A8B9A"/>:'—'}</td>
                        <td style={{ padding:'10px 14px', fontFamily:"'Space Mono',monospace", color:'#4ECDC4', fontSize:11 }}>{item.grading_service&&item.grade_score?`${item.grading_service} ${item.grade_score}`:'—'}</td>
                        <td style={{ padding:'10px 14px', fontFamily:"'Playfair Display',serif", fontWeight:700, color:'#D4AF37', fontSize:14 }}>{fmt(item.market_value)}</td>
                        <td style={{ padding:'10px 14px', fontFamily:"'Space Mono',monospace", color:'#7A8B9A' }}>{item.purchase_price?fmt(item.purchase_price):'—'}</td>
                        <td style={{ padding:'10px 14px', fontFamily:"'Space Mono',monospace", color:!hasCost?'#7A8B9A':gain>=0?'#96CEB4':'#FF6B6B' }}>{!hasCost?'—':(gain>=0?'+':'')+fmt(gain)}</td>
                        <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}>
                          <button onClick={()=>handleEdit(item)} style={{ background:'rgba(212,175,55,0.15)', color:'#D4AF37', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11, marginRight:6 }}>Edit</button>
                          <button onClick={()=>handleDelete(item.id)} style={{ background:'rgba(255,107,107,0.15)', color:'#FF6B6B', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11 }}>Del</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length===0&&<div style={{ textAlign:'center', padding:'40px', color:'#7A8B9A', fontFamily:"'Playfair Display',serif" }}>No items</div>}
            </div>
          </div>
        )}
        {/* DETAIL */}
        {!loading && view==='detail' && selected && (
          <div className="fade-in" style={{ maxWidth:900, margin:'0 auto' }}>
            <button onClick={()=>setView('gallery')} style={{ background:'transparent', color:'#7A8B9A', border:'none', cursor:'pointer', fontFamily:"'Space Mono',monospace", fontSize:12, marginBottom:20, padding:0 }}>← Back</button>
            <div style={{ display:'grid', gridTemplateColumns:'minmax(0,280px) 1fr', gap:24 }}>
              <div>
                <div style={{ height:280, borderRadius:14, overflow:'hidden', background:selected.image_url?`url(${selected.image_url}) center/cover`:'rgba(255,255,255,0.03)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:72, border:'1px solid rgba(255,255,255,0.08)' }}>
                  {!selected.image_url&&(CAT_EMOJI[selected.category]||'📦')}
                </div>
                <div style={{ marginTop:14, display:'flex', flexDirection:'column', gap:8 }}>
                  <button onClick={()=>handleEdit(selected)} style={{ background:'rgba(212,175,55,0.15)', color:'#D4AF37', border:'1px solid rgba(212,175,55,0.3)', borderRadius:10, padding:'10px', cursor:'pointer', fontFamily:"'Space Mono',monospace", fontSize:12 }}>✏️ Edit Item</button>
                  <button onClick={()=>handleRefresh(selected)} disabled={refreshing} style={{ background:'rgba(78,205,196,0.15)', color:'#4ECDC4', border:'1px solid rgba(78,205,196,0.3)', borderRadius:10, padding:'10px', cursor:'pointer', fontFamily:"'Space Mono',monospace", fontSize:12 }}>
                    {refreshing?'Refreshing…':'📈 Refresh Market Value'}
                  </button>
                  <button onClick={()=>handleGradeAdvisor(selected)} disabled={grading} style={{ background:'rgba(199,125,255,0.15)', color:'#C77DFF', border:'1px solid rgba(199,125,255,0.3)', borderRadius:10, padding:'10px', cursor:'pointer', fontFamily:"'Space Mono',monospace", fontSize:12 }}>
                    {grading?'Analyzing…':'🏅 Should I Grade This?'}
                  </button>
                  <button onClick={()=>handleDelete(selected.id)} style={{ background:'rgba(255,107,107,0.1)', color:'#FF6B6B', border:'1px solid rgba(255,107,107,0.2)', borderRadius:10, padding:'10px', cursor:'pointer', fontFamily:"'Space Mono',monospace", fontSize:12 }}>🗑️ Remove</button>
                </div>
              </div>
              <div>
                <Badge text={selected.category} color={CAT_COLOR[selected.category]} />
                <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:26, fontWeight:700, margin:'8px 0 4px', lineHeight:1.2 }}>{selected.name}</h1>
                <p style={{ color:'#7A8B9A', fontFamily:"'Space Mono',monospace", fontSize:11, margin:'0 0 20px' }}>{[selected.player,selected.team,selected.year].filter(Boolean).join(' · ')}</p>
                <div style={{ display:'flex', gap:20, marginBottom:24 }}>
                  <div>
                    <div style={{ fontSize:10, color:'#7A8B9A', letterSpacing:2, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:4 }}>Market Value</div>
                    <div style={{ fontSize:30, fontWeight:700, color:'#D4AF37', fontFamily:"'Playfair Display',serif" }}>{fmt(selected.market_value)}</div>
                  </div>
                  {selected.purchase_price&&<div>
                    <div style={{ fontSize:10, color:'#7A8B9A', letterSpacing:2, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:4 }}>Purchased</div>
                    <div style={{ fontSize:22, fontWeight:600, color:'#C0AE8A', fontFamily:"'Playfair Display',serif" }}>{fmt(selected.purchase_price)}</div>
                  </div>}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                  {[['Manufacturer',selected.manufacturer],['Condition',selected.condition],['Grading',selected.grading_service&&selected.grade_score?`${selected.grading_service} ${selected.grade_score}`:selected.grading_service],['Serial / Cert',selected.serial_number],['Purchase Date',selected.purchase_date]].filter(([,v])=>v).map(([label,value])=>(
                    <div key={label} style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:'10px 14px', border:'1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize:9, color:'#7A8B9A', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:3 }}>{label}</div>
                      <div style={{ fontSize:14 }}>{value}</div>
                    </div>
                  ))}
                </div>
                {selected.notes&&<div style={{ background:'rgba(212,175,55,0.05)', border:'1px solid rgba(212,175,55,0.15)', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
                  <div style={{ fontSize:9, color:'#D4AF37', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:5 }}>Notes</div>
                  <div style={{ fontSize:14, lineHeight:1.6, color:'#C0AE8A' }}>{selected.notes}</div>
                </div>}

                {refreshResult&&refreshResult.itemId===selected.id&&(
                  <div style={{ marginBottom:16, background:'rgba(78,205,196,0.05)', border:'1px solid rgba(78,205,196,0.2)', borderRadius:12, padding:'16px' }}>
                    <div style={{ fontSize:11, color:'#4ECDC4', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:10 }}>📈 Market Refresh</div>
                    <div style={{ display:'flex', gap:20, marginBottom:10 }}>
                      <div><div style={{ fontSize:10, color:'#7A8B9A', marginBottom:3 }}>Previous</div><div style={{ fontSize:18, color:'#7A8B9A', fontFamily:"'Playfair Display',serif" }}>{fmt(refreshResult.oldValue)}</div></div>
                      <div><div style={{ fontSize:10, color:'#7A8B9A', marginBottom:3 }}>Updated</div><div style={{ fontSize:22, fontWeight:700, color:'#4ECDC4', fontFamily:"'Playfair Display',serif" }}>{fmt(refreshResult.marketValue)}</div></div>
                      <div><div style={{ fontSize:10, color:'#7A8B9A', marginBottom:3 }}>Confidence</div><Badge text={refreshResult.confidence} color={refreshResult.confidence==='high'?'#96CEB4':refreshResult.confidence==='medium'?'#D4AF37':'#FF6B6B'} /></div>
                    </div>
                    <p style={{ fontSize:13, color:'#C0AE8A', lineHeight:1.6, marginBottom:12 }}>{refreshResult.reasoning}</p>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={applyRefresh} style={{ background:'linear-gradient(135deg,#4ECDC4,#2EA8A0)', color:'#0A0F1C', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontFamily:"'Space Mono',monospace", fontSize:12, fontWeight:700 }}>Apply Update</button>
                      <button onClick={()=>setRefreshResult(null)} style={{ background:'transparent', color:'#7A8B9A', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontFamily:"'Space Mono',monospace", fontSize:12 }}>Dismiss</button>
                    </div>
                  </div>
                )}

                {gradingResult&&(
                  <div style={{ background:'rgba(199,125,255,0.05)', border:'1px solid rgba(199,125,255,0.2)', borderRadius:12, padding:'16px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <div style={{ fontSize:11, color:'#C77DFF', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace" }}>🏅 Grading Analysis</div>
                      <Badge text={gradingResult.verdict} color={verdictColor(gradingResult.verdict)} />
                    </div>
                    <p style={{ fontSize:13, color:'#C0AE8A', lineHeight:1.6, marginBottom:14 }}>{gradingResult.summary}</p>
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:10, color:'#7A8B9A', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:8 }}>Grade Value Breakdown</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {gradingResult.gradingTiers?.map(tier=>(
                          <div key={tier.grade} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'8px 12px' }}>
                            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:12, color:'#C77DFF', minWidth:60 }}>{tier.grade}</div>
                            <div style={{ fontSize:11, color:'#7A8B9A' }}>{tier.probability}</div>
                            <div style={{ fontFamily:"'Playfair Display',serif", fontWeight:700, color:'#F0E6C8' }}>{fmt(tier.estimatedValue)}</div>
                            <div style={{ fontSize:11, color:tier.netGain>=0?'#96CEB4':'#FF6B6B', fontFamily:"'Space Mono',monospace" }}>{tier.netGain>=0?'+':''}{fmt(tier.netGain)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:12, marginBottom:12, flexWrap:'wrap' }}>
                      <div style={{ ...card, flex:1 }}><div style={{ fontSize:9, color:'#7A8B9A', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:4 }}>Grading Cost</div><div style={{ fontSize:16, fontWeight:700, color:'#FF6B6B', fontFamily:"'Playfair Display',serif" }}>{fmt(gradingResult.estimatedGradingCost)}</div></div>
                      <div style={{ ...card, flex:1 }}><div style={{ fontSize:9, color:'#7A8B9A', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:4 }}>Expected Gain</div><div style={{ fontSize:16, fontWeight:700, color:gradingResult.expectedGain>=0?'#96CEB4':'#FF6B6B', fontFamily:"'Playfair Display',serif" }}>{fmt(gradingResult.expectedGain)}</div></div>
                      <div style={{ ...card, flex:1 }}><div style={{ fontSize:9, color:'#7A8B9A', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:4 }}>Best Case</div><div style={{ fontSize:16, fontWeight:700, color:'#96CEB4', fontFamily:"'Playfair Display',serif" }}>{fmt(gradingResult.bestCaseGain)}</div></div>
                    </div>
                    {gradingResult.recommendedService&&<p style={{ fontSize:12, color:'#C77DFF', marginBottom:10, fontFamily:"'Space Mono',monospace" }}>Recommended: {gradingResult.recommendedService}</p>}
                    <button onClick={()=>setGradingResult(null)} style={{ background:'transparent', color:'#7A8B9A', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontFamily:"'Space Mono',monospace", fontSize:12 }}>Dismiss</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* DEAL SCANNER */}
        {view==='deal' && <DealScanner />}
        {/* ADD / EDIT */}
        {view==='add' && (
          <div className="fade-in" style={{ maxWidth:760, margin:'0 auto' }}>
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:24, marginBottom:6 }}>{editingId?'Edit Item':'Add to The Vault'}</h2>
            <p style={{ color:'#7A8B9A', fontSize:14, marginBottom:24 }}>{editingId?'Update the details for this item.':'Drop a photo — AI identifies your item automatically.'}</p>
            {!editingId&&(
              <>
                <div style={{ marginBottom:16 }}>
                  <label style={lbl}>💡 AI Hints <span style={{ color:'#555', fontSize:10, textTransform:'none', letterSpacing:0 }}>optional — help the AI be more accurate</span></label>
                  <input value={aiHints} onChange={e=>setAiHints(e.target.value)} style={inp} placeholder='e.g. "Signed by Sandy Koufax" or "This is a 1965 Topps card"' />
                </div>
                <div onDrop={handleDrop} onDragOver={e=>e.preventDefault()} onClick={()=>fileRef.current?.click()}
                  style={{ border:'2px dashed rgba(212,175,55,0.3)', borderRadius:14, padding:'28px', textAlign:'center', cursor:'pointer', background:imagePreview?'transparent':'rgba(212,175,55,0.03)', marginBottom:24, transition:'all 0.2s' }}>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e=>handleImageUpload(e.target.files[0])} />
                  {imagePreview?(
                    <div style={{ display:'flex', gap:16, alignItems:'flex-start', textAlign:'left' }}>
                      <img src={imagePreview} alt="Preview" style={{ width:120, height:120, objectFit:'cover', borderRadius:10, border:'1px solid rgba(212,175,55,0.3)', flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        {aiLoading?<Spinner label="Analyzing your item…" />:(
                          <>
                            {aiError?<div style={{ color:'#FF6B6B', fontSize:13, marginBottom:8 }}>⚠️ {aiError}</div>
                              :<div style={{ color:'#96CEB4', fontSize:13, marginBottom:6, fontFamily:"'Space Mono',monospace" }}>✓ AI analysis complete</div>}
                            <div style={{ fontSize:12, color:'#7A8B9A', marginBottom:10 }}>Review and adjust fields below</div>
                            <button onClick={e=>{e.stopPropagation();setImagePreview(null);setImageFile(null);setForm(EMPTY)}} style={{ background:'rgba(255,107,107,0.1)', color:'#FF6B6B', border:'1px solid rgba(255,107,107,0.2)', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontSize:12 }}>Clear & Re-upload</button>
                          </>
                        )}
                      </div>
                    </div>
                  ):(
                    <>
                      <div style={{ fontSize:36, marginBottom:10 }}>📸</div>
                      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, marginBottom:4 }}>Drop a photo or tap to use camera</div>
                      <div style={{ fontSize:12, color:'#7A8B9A', marginBottom:12 }}>AI will identify your item and fill in the details</div>
                      <span style={{ background:'rgba(212,175,55,0.1)', border:'1px solid rgba(212,175,55,0.3)', borderRadius:8, padding:'5px 14px', fontSize:11, fontFamily:"'Space Mono',monospace", color:'#D4AF37' }}>✨ AI-Powered</span>
                    </>
                  )}
                </div>
              </>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Item Name *</label><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={inp} placeholder="e.g. Mike Trout 2011 Bowman Chrome Rookie" /></div>
              {[['player','Player / Subject','e.g. Mike Trout'],['team','Team','e.g. Los Angeles Angels'],['year','Year','e.g. 2011'],['manufacturer','Manufacturer / Brand','e.g. Topps, FOCO, Rawlings'],['serial_number','Serial / Cert Number',''],['grade_score','Grade Score','e.g. 9.5']].map(([key,label,placeholder])=>(
                <div key={key}><label style={lbl}>{label}</label><input value={form[key]||''} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} style={inp} placeholder={placeholder} /></div>
              ))}
              <div><label style={lbl}>Category</label><select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={inp}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label style={lbl}>Condition</label><select value={form.condition} onChange={e=>setForm(p=>({...p,condition:e.target.value}))} style={inp}>{CONDITIONS.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label style={lbl}>Grading Service</label><select value={form.grading_service||''} onChange={e=>setForm(p=>({...p,grading_service:e.target.value}))} style={inp}>{GRADERS.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label style={lbl}>Market Value ($)</label><input type="number" value={form.market_value||''} onChange={e=>setForm(p=>({...p,market_value:e.target.value}))} style={inp} placeholder="0" /></div>
              <div><label style={lbl}>Purchase Price ($) <span style={{ color:'#555', fontSize:10 }}>optional</span></label><input type="number" value={form.purchase_price||''} onChange={e=>setForm(p=>({...p,purchase_price:e.target.value}))} style={inp} placeholder="Leave blank if unknown" /></div>
              <div><label style={lbl}>Purchase Date <span style={{ color:'#555', fontSize:10 }}>optional</span></label><input type="date" value={form.purchase_date||''} onChange={e=>setForm(p=>({...p,purchase_date:e.target.value}))} style={inp} /></div>
              <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Notes</label><textarea value={form.notes||''} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} style={{ ...inp, height:80, resize:'vertical', fontFamily:"'Crimson Text',serif", fontSize:15 }} placeholder="Provenance, storage location, COA details, story…" /></div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:24 }}>
              <button onClick={handleSave} disabled={!form.name||saving} style={{ background:(form.name&&!saving)?'linear-gradient(135deg,#D4AF37,#A0832A)':'rgba(255,255,255,0.1)', color:(form.name&&!saving)?'#0A0F1C':'#555', border:'none', borderRadius:10, padding:'12px 28px', fontSize:14, fontWeight:700, fontFamily:"'Space Mono',monospace", cursor:(form.name&&!saving)?'pointer':'not-allowed' }}>
                {saving?'Saving…':editingId?'Save Changes':'Add to Vault'}
              </button>
              <button onClick={()=>{ resetForm(); setView('gallery') }} style={{ background:'transparent', color:'#7A8B9A', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'12px 20px', fontSize:14, cursor:'pointer', fontFamily:"'Space Mono',monospace" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DealScanner() {
  const [imagePreview, setImagePreview] = useState(null)
  const [askingPrice,  setAskingPrice]  = useState('')
  const [hints,        setHints]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [result,       setResult]       = useState(null)
  const [error,        setError]        = useState('')
  const fileRef = useRef()

  const sinp = { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, color:'#F0E6C8', padding:'10px 14px', fontSize:14, fontFamily:"'Space Mono',monospace", outline:'none', width:'100%' }
  const slbl = { fontSize:11, color:'#7A8B9A', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:5, display:'block' }
  const dealColor = v => v==='Great Deal'||v==='Good Deal'?'#96CEB4':v==='Overpriced'?'#FF6B6B':'#D4AF37'
  const recColor  = v => v==='Buy'?'#96CEB4':v==='Pass'?'#FF6B6B':'#D4AF37'

  async function handleImageUpload(file) {
    if (!file) return
    const dataUrl = await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=e=>resolve(e.target.result); r.onerror=reject; r.readAsDataURL(file) })
    setImagePreview(dataUrl); setResult(null); setError('')
  }

  async function handleScan() {
    if (!imagePreview) return
    setLoading(true); setError('')
    try {
      const img = new Image(); img.src = imagePreview
      await new Promise((resolve,reject)=>{ img.onload=resolve; img.onerror=reject })
      const canvas = document.createElement('canvas')
      const MAX=1200; const scale=Math.min(MAX/img.width,MAX/img.height,1)
      canvas.width=Math.round(img.width*scale); canvas.height=Math.round(img.height*scale)
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height)
      const base64=canvas.toDataURL('image/jpeg',0.85).split(',')[1]
      const res = await fetch('/api/deal', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ imageData:base64, mediaType:'image/jpeg', askingPrice:askingPrice||null, hints:hints||null }) })
      if (!res.ok) { const e=await res.json(); throw new Error(e.error||`Error ${res.status}`) }
      setResult(await res.json())
    } catch(err) { setError(`Scan failed: ${err.message}`) }
    setLoading(false)
  }

  return (
    <div className="fade-in" style={{ maxWidth:800, margin:'0 auto' }}>
      <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:24, marginBottom:6 }}>🔍 Deal Scanner</h2>
      <p style={{ color:'#7A8B9A', fontSize:14, marginBottom:24 }}>Thinking of buying something? Take a photo and let AI tell you if it's worth the price.</p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:20 }}>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={slbl}>Photo of Item *</label>
          <div onClick={()=>fileRef.current?.click()} style={{ border:'2px dashed rgba(212,175,55,0.3)', borderRadius:14, padding:'24px', textAlign:'center', cursor:'pointer', background:imagePreview?'transparent':'rgba(212,175,55,0.03)', minHeight:120, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e=>handleImageUpload(e.target.files[0])} />
            {imagePreview?<img src={imagePreview} alt="Preview" style={{ maxHeight:200, maxWidth:'100%', borderRadius:10, objectFit:'contain' }} />
              :<div><div style={{ fontSize:32, marginBottom:8 }}>📸</div><div style={{ color:'#7A8B9A', fontSize:13 }}>Tap to take photo or upload</div></div>}
          </div>
        </div>
        <div><label style={slbl}>Asking Price ($) <span style={{ color:'#555', fontSize:10, textTransform:'none' }}>optional</span></label><input type="number" value={askingPrice} onChange={e=>setAskingPrice(e.target.value)} style={sinp} placeholder="e.g. 150" /></div>
        <div><label style={slbl}>Hints <span style={{ color:'#555', fontSize:10, textTransform:'none' }}>optional</span></label><input value={hints} onChange={e=>setHints(e.target.value)} style={sinp} placeholder='e.g. "Seller says PSA 9" or "Signed by Jeter"' /></div>
      </div>
      <button onClick={handleScan} disabled={!imagePreview||loading}
        style={{ background:imagePreview&&!loading?'linear-gradient(135deg,#D4AF37,#A0832A)':'rgba(255,255,255,0.1)', color:imagePreview&&!loading?'#0A0F1C':'#555', border:'none', borderRadius:10, padding:'12px 28px', fontSize:14, fontWeight:700, fontFamily:"'Space Mono',monospace", cursor:imagePreview&&!loading?'pointer':'not-allowed', marginBottom:24 }}>
        {loading?'Analyzing…':'🔍 Scan This Deal'}
      </button>
      {error&&<div style={{ color:'#FF6B6B', fontSize:13, marginBottom:16 }}>⚠️ {error}</div>}
      {loading&&<Spinner label="Evaluating this deal…" />}
      {result&&!loading&&(
        <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, padding:'20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12, marginBottom:12 }}>
              <div>
                <h3 style={{ fontFamily:"'Playfair Display',serif", fontSize:20, margin:'0 0 4px' }}>{result.name}</h3>
                <p style={{ color:'#7A8B9A', fontFamily:"'Space Mono',monospace", fontSize:11, margin:0 }}>{[result.player,result.team,result.year].filter(Boolean).join(' · ')}</p>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Badge text={result.dealRating} color={dealColor(result.dealRating)} />
                <Badge text={result.recommendation} color={recColor(result.recommendation)} />
              </div>
            </div>
            <p style={{ fontSize:14, color:'#C0AE8A', lineHeight:1.7, margin:0 }}>{result.summary}</p>
          </div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'14px 18px', flex:1, minWidth:120 }}>
              <div style={{ fontSize:10, color:'#7A8B9A', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:4 }}>Market Value</div>
              <div style={{ fontSize:22, fontWeight:700, color:'#D4AF37', fontFamily:"'Playfair Display',serif" }}>{fmt(result.marketValue)}</div>
            </div>
            {askingPrice&&<div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'14px 18px', flex:1, minWidth:120 }}>
              <div style={{ fontSize:10, color:'#7A8B9A', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:4 }}>Asking Price</div>
              <div style={{ fontSize:22, fontWeight:700, color:'#F0E6C8', fontFamily:"'Playfair Display',serif" }}>{fmt(askingPrice)}</div>
            </div>}
            {askingPrice&&<div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'14px 18px', flex:1, minWidth:120 }}>
              <div style={{ fontSize:10, color:'#7A8B9A', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:4 }}>Difference</div>
              <div style={{ fontSize:22, fontWeight:700, fontFamily:"'Playfair Display',serif", color:(result.marketValue-Number(askingPrice))>=0?'#96CEB4':'#FF6B6B' }}>{(result.marketValue-Number(askingPrice))>=0?'+':''}{fmt(result.marketValue-Number(askingPrice))}</div>
            </div>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ background:'rgba(150,206,180,0.05)', border:'1px solid rgba(150,206,180,0.2)', borderRadius:12, padding:'14px' }}>
              <div style={{ fontSize:10, color:'#96CEB4', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:10 }}>✅ Pros</div>
              {result.pros?.map((p,i)=><div key={i} style={{ fontSize:13, color:'#C0AE8A', marginBottom:6, lineHeight:1.5 }}>• {p}</div>)}
            </div>
            <div style={{ background:'rgba(255,107,107,0.05)', border:'1px solid rgba(255,107,107,0.2)', borderRadius:12, padding:'14px' }}>
              <div style={{ fontSize:10, color:'#FF6B6B', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:10 }}>❌ Cons</div>
              {result.cons?.map((c,i)=><div key={i} style={{ fontSize:13, color:'#C0AE8A', marginBottom:6, lineHeight:1.5 }}>• {c}</div>)}
            </div>
          </div>
          {result.redFlags?.length>0&&(
            <div style={{ background:'rgba(255,107,107,0.08)', border:'1px solid rgba(255,107,107,0.3)', borderRadius:12, padding:'14px' }}>
              <div style={{ fontSize:10, color:'#FF6B6B', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:10 }}>🚩 Red Flags</div>
              {result.redFlags.map((f,i)=><div key={i} style={{ fontSize:13, color:'#FF9999', marginBottom:6 }}>• {f}</div>)}
            </div>
          )}
          {result.gradingPotential&&(
            <div style={{ background:'rgba(199,125,255,0.05)', border:'1px solid rgba(199,125,255,0.2)', borderRadius:12, padding:'14px' }}>
              <div style={{ fontSize:10, color:'#C77DFF', letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Space Mono',monospace", marginBottom:6 }}>🏅 Grading Potential</div>
              <div style={{ fontSize:13, color:'#C0AE8A' }}>{result.gradingPotential}</div>
            </div>
          )}
          <button onClick={()=>{ setResult(null); setImagePreview(null); setAskingPrice(''); setHints('') }} style={{ background:'transparent', color:'#7A8B9A', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 20px', cursor:'pointer', fontFamily:"'Space Mono',monospace", fontSize:12, alignSelf:'flex-start' }}>Scan Another Item</button>
        </div>
      )}
    </div>
  )
}
