import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Search, ShoppingBasket, MapPin, Plus, Minus, Trash2, Clock3, Bike, Leaf, ChevronRight, PackageCheck, X } from 'lucide-react'
import './styles.css'
import { supabase } from './lib/supabase'

const products = [
  {id:1,name:'Tomatoes',unit:'500 g',price:28,old:35,category:'Vegetables',emoji:'🍅'},
  {id:2,name:'Potatoes',unit:'1 kg',price:34,old:42,category:'Vegetables',emoji:'🥔'},
  {id:3,name:'Onions',unit:'1 kg',price:39,old:48,category:'Vegetables',emoji:'🧅'},
  {id:4,name:'Bananas',unit:'6 pieces',price:42,old:50,category:'Fruits',emoji:'🍌'},
  {id:5,name:'Apples',unit:'4 pieces',price:99,old:120,category:'Fruits',emoji:'🍎'},
  {id:6,name:'Fresh Milk',unit:'500 ml',price:35,old:42,category:'Dairy',emoji:'🥛'},
  {id:7,name:'Brown Bread',unit:'400 g',price:45,old:50,category:'Bakery',emoji:'🍞'},
  {id:8,name:'Eggs',unit:'6 pieces',price:48,old:55,category:'Dairy',emoji:'🥚'},
  {id:9,name:'Basmati Rice',unit:'1 kg',price:89,old:110,category:'Staples',emoji:'🍚'},
  {id:10,name:'Cooking Oil',unit:'1 L',price:145,old:165,category:'Staples',emoji:'🫒'},
  {id:11,name:'Spinach',unit:'1 bunch',price:25,old:30,category:'Vegetables',emoji:'🥬'},
  {id:12,name:'Orange Juice',unit:'1 L',price:110,old:130,category:'Beverages',emoji:'🧃'}
]
const categories = ['All','Vegetables','Fruits','Dairy','Bakery','Staples','Beverages']
const money = n => `₹${Number(n).toFixed(0)}`
const UPI_QR_DATA = 'data:image/png;base64,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'
const PAYMENT_WHATSAPP = '9703288210'

function App(){
  const [cart,setCart] = useState({})
  const [catalog,setCatalog] = useState(products)
  const [dbConnected,setDbConnected] = useState(false)
  const [placingOrder,setPlacingOrder] = useState(false)
  const [submittingPayment,setSubmittingPayment] = useState(false)
  const [category,setCategory] = useState('All')
  const [search,setSearch] = useState('')
  const [showCart,setShowCart] = useState(false)
  const [checkout,setCheckout] = useState(false)
  const [name,setName] = useState('')
  const [phone,setPhone] = useState('')
  const [address,setAddress] = useState('')
  const [notes,setNotes] = useState('')
  const [order,setOrder] = useState(null)
  const [toast,setToast] = useState('')
  const [admin,setAdmin] = useState(false)
  const [deliveryFee,setDeliveryFee] = useState(20)
  const [shopName,setShopName] = useState('Local Basket')
  const [whatsapp,setWhatsapp] = useState('')
  const count = Object.values(cart).reduce((a,b)=>a+b,0)
  const subtotal = catalog.reduce((sum,p)=>sum+p.price*(cart[p.id]||0),0)
  const filtered = useMemo(()=>catalog.filter(p=>(category==='All'||p.category===category)&&p.name.toLowerCase().includes(search.toLowerCase())),[catalog,category,search])
  const notify = msg => { setToast(msg); setTimeout(()=>setToast(''),2500) }
  const add = id => setCart(c=>({...c,[id]:(c[id]||0)+1}))
  const change = (id,delta) => setCart(c=>{const n=(c[id]||0)+delta;const next={...c};if(n<=0)delete next[id];else next[id]=n;return next})
  useEffect(()=>{ if('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(()=>{}) },[])
  useEffect(()=>{
    let alive = true
    supabase.from('products').select('id,name,unit,price,mrp,category,emoji,stock_qty').eq('is_active',true).order('id')
      .then(({data,error})=>{
        if(!alive) return
        if(error){ console.warn('Products DB not available yet:',error.message); return }
        if(data?.length){ setCatalog(data.map(p=>({...p,price:Number(p.price),old:Number(p.mrp),stockQty:p.stock_qty}))); setDbConnected(true) }
      })
    return ()=>{alive=false}
  },[])
  const submitOrder = async e => {
    e.preventDefault()
    if(!name.trim()||phone.replace(/\D/g,'').length<10||!address.trim()){notify('Please enter your name, valid phone and delivery address.');return}
    if(!dbConnected){notify('Database is not reachable yet. Please retry in a moment.');return}
    const items = catalog.filter(p=>cart[p.id]).map(p=>({product_id:Number(p.id),quantity:cart[p.id]}))
    if(!items.length){notify('Your cart is empty.');return}
    setPlacingOrder(true)
    const {data,error} = await supabase.functions.invoke('create-order',{body:{
      customer_name:name,customer_phone:phone,delivery_address:address,delivery_notes:notes,
      delivery_fee:deliveryFee,items
    }})
    setPlacingOrder(false)
    if(error||data?.error){
      notify(data?.error || error?.message || 'Could not place order. Please try again.')
      return
    }
    const dbOrder=data.order
    const newOrder={
      id:dbOrder.order_number,dbId:dbOrder.id,name:dbOrder.customer_name,phone:dbOrder.customer_phone,
      address:dbOrder.delivery_address,notes:dbOrder.delivery_notes,
      items:(data.items||[]).map(i=>({id:i.product_id,name:i.product_name,unit:i.unit,price:Number(i.unit_price),qty:i.quantity,emoji:catalog.find(p=>Number(p.id)===Number(i.product_id))?.emoji||'🛒'})),
      subtotal:Number(dbOrder.subtotal),deliveryFee:Number(dbOrder.delivery_fee),total:Number(dbOrder.total),
      status:'Order received',paymentStatus:dbOrder.payment_status,createdAt:new Date(dbOrder.created_at).toLocaleString()
    }
    setOrder(newOrder);setCart({});setCheckout(false);setShowCart(false);notify('Order saved! Please complete your UPI payment.')
    try { localStorage.setItem('localBasketLastOrder',JSON.stringify(newOrder)); } catch {}
  }
  const shareOrder = () => {
    if(!order)return
    const text=`${shopName} order ${order.id}\\n${order.items.map(i=>`${i.name} x${i.qty} - ${money(i.price*i.qty)}`).join('\\n')}\\nTotal: ${money(order.total)}\\nCustomer: ${order.name}, ${order.phone}\\nAddress: ${order.address}`
    if(whatsapp.trim()) window.open(`https://wa.me/${whatsapp.replace(/\\D/g,'')}?text=${encodeURIComponent(text)}`,'_blank')
    else if(navigator.share) navigator.share({title:'Grocery order '+order.id,text}).catch(()=>{})
    else {navigator.clipboard?.writeText(text);notify('Order summary copied if clipboard is available.')}
  }
  const submitPaymentDone = async () => {
    if(!order || submittingPayment) return
    const wa = window.open('about:blank','_blank')
    setSubmittingPayment(true)
    const {data,error} = await supabase.functions.invoke('submit-payment',{body:{
      order_id:order.dbId, order_number:order.id, customer_phone:order.phone
    }})
    setSubmittingPayment(false)
    if(error || data?.error){
      if(wa) wa.close()
      notify(data?.error || error?.message || 'Could not update payment status. Please retry.')
      return
    }
    setOrder(o=>o?({...o,paymentStatus:data.payment_status || 'pending_verification'}):o)
    notify('Payment marked as submitted. Owner verification is pending.')
    const message = `Local Basket payment screenshot\\nOrder: ${order.id}\\nAmount: ${money(order.total)}\\nCustomer: ${order.name}\\nPhone: ${order.phone}\\nI have made the payment. Please verify it in your bank/UPI app. I will attach my payment screenshot here.\\n\\nThis message is not proof of payment; please verify the bank credit.`
    const url = `https://wa.me/${PAYMENT_WHATSAPP}?text=${encodeURIComponent(message)}`
    if(wa) wa.location.href=url
    else window.open(url,'_blank')
  }
  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e=>{e.preventDefault();setAdmin(false)}}><span className="brand-icon">🛍️</span><span>{shopName}<small>FRESH • LOCAL • FAST</small></span></a>
      <button className="location" onClick={()=>notify('Delivery area: configure your local service area in the admin panel.')}><MapPin size={16}/><span>Deliver to <b>Your location</b></span><ChevronRight size={15}/></button>
      <button className="cart-button" onClick={()=>setShowCart(true)}><ShoppingBasket size={19}/><span>Cart</span>{count>0&&<b className="cart-count">{count}</b>}</button>
    </header>
    <main>
      {!admin&&!order&&<>
        <section className="hero">
          <div className="hero-copy"><span className="eyebrow"><Leaf size={14}/> YOUR NEIGHBOURHOOD STORE</span><h1>Everyday essentials.<br/><em>Right to your door.</em></h1><p>Fresh picks from local shops, delivered with care.</p><div className="hero-points"><span><Clock3 size={16}/> Quick local delivery</span><span><Bike size={17}/> Local delivery</span></div></div>
          <div className="hero-art"><div className="sun"></div><span className="fruit f1">🍊</span><span className="fruit f2">🥑</span><span className="fruit f3">🍅</span><span className="fruit f4">🥦</span><span className="basket-art">🧺</span><div className="hero-tag">Fresh every day</div></div>
        </section>
        <section className="search-row"><div className="searchbox"><Search size={20}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search for milk, fruits, vegetables..."/></div><div className="delivery-chip"><Clock3 size={16}/> Delivery timing confirmed after order</div></section>
        <section className="categories"><div className="section-heading"><div><span className="eyebrow">SHOP BY CATEGORY</span><h2>What do you need today?</h2></div></div><div className="category-list">{categories.map((c,i)=><button key={c} onClick={()=>setCategory(c)} className={`category-pill ${category===c?'active':''}`}><span>{['🛒','🥦','🍎','🥛','🍞','🌾','🧃'][i]}</span>{c}</button>)}</div></section>
        <section className="products-section"><div className="section-heading"><div><span className="eyebrow">LOCAL FAVOURITES</span><h2>{category==='All'?'Popular near you':category}</h2></div><span className={`db-status ${dbConnected?'connected':''}`}><i/>{dbConnected?'Live stock':'Demo catalogue'}</span></div><div className="product-grid">{filtered.map(p=><article className="product-card" key={p.id}><div className="product-image"><span className="discount">{Math.round((1-p.price/p.old)*100)}% OFF</span><span className="product-emoji">{p.emoji}</span></div><div className="product-info"><span className="product-unit">{p.unit}</span><h3>{p.name}</h3><div className="price-row"><div><b>{money(p.price)}</b><del>{money(p.old)}</del></div>{cart[p.id]?<div className="quantity"><button onClick={()=>change(p.id,-1)} aria-label="Decrease"><Minus size={14}/></button><b>{cart[p.id]}</b><button onClick={()=>add(p.id)} aria-label="Increase"><Plus size={14}/></button></div>:<button className="add-button" onClick={()=>add(p.id)}><Plus size={15}/> ADD</button>}</div></div></article>)}</div>{filtered.length===0&&<div className="empty">No products found. Try another search.</div>}</section>
        <section className="trust-row"><div><span>🌱</span><b>Local-first</b><small>Supporting nearby stores</small></div><div><span>🧺</span><b>Everyday value</b><small>Clear product pricing</small></div><div><span>🤝</span><b>Personal service</b><small>Local delivery support</small></div></section>
      </>}
      {order&&<section className="order-success">
        <div className="success-icon"><PackageCheck size={40}/></div>
        <span className="eyebrow">ORDER & PAYMENT</span>
        <h1>Thanks, {order.name.split(' ')[0]}!</h1>
        <p>Your order <b>{order.id}</b> is saved in Local Basket.</p>
        <div className="order-card">
          <div className="order-status"><span className="status-dot"></span>{order.paymentStatus==='pending_verification'?'Payment submitted — awaiting verification':order.paymentStatus==='paid'?'Payment verified':'Order received — payment pending'}<small>{order.createdAt}</small></div>
          {order.items.map(i=><div className="order-line" key={i.id}><span>{i.emoji} {i.name} × {i.qty}</span><b>{money(i.price*i.qty)}</b></div>)}
          <div className="order-line"><span>Delivery fee</span><b>{money(order.deliveryFee)}</b></div>
          <div className="order-total"><span>Total to pay</span><b>{money(order.total)}</b></div>
          <p className="address-line"><MapPin size={15}/>{order.address}</p>
        </div>
        {order.paymentStatus!=='paid'&&<div className="payment-panel">
          <span className="eyebrow">PAY USING UPI QR</span>
          <h2>Scan & pay {money(order.total)}</h2>
          <p>Open any UPI app and scan this QR. Enter the exact amount shown above.</p>
          <img className="upi-qr" src={UPI_QR_DATA} alt="UPI payment QR code" />
          <div className="payment-instructions">
            <b>After you pay</b>
            <ol>
              <li>Tap <b>“I have done payment”</b> below.</li>
              <li>WhatsApp will open a message to <b>{PAYMENT_WHATSAPP}</b>.</li>
              <li>Attach your payment screenshot in that WhatsApp chat and send it.</li>
              <li>Tracking will show that payment proof was submitted. Payment is confirmed only after the owner checks the bank/UPI transaction.</li>
            </ol>
          </div>
          <button className="primary-button full" onClick={submitPaymentDone} disabled={submittingPayment}>{submittingPayment?'Updating order…':'I have done payment'} <ChevronRight size={18}/></button>
          {order.paymentStatus==='pending_verification'&&<div className="tracking-panel">
            <h3><PackageCheck size={18}/> Order tracking</h3>
            <p className="tracking-status">Payment submitted · Waiting for owner verification</p>
            <div className="tracking-steps"><span className="active">Order received</span><span className="active">Payment review</span><span>Preparing</span><span>Out for delivery</span><span>Delivered</span></div>
            <small>Live delivery location is not enabled yet. The owner must verify payment and update the order status before fulfilment.</small>
          </div>}
        </div>}
        <button className="secondary-button" onClick={shareOrder}>Share order summary</button>
        <button className="text-button" onClick={()=>{setOrder(null);setCategory('All')}}>Continue shopping</button>
      </section>}
      {admin&&<section className="admin-page"><button className="text-button" onClick={()=>setAdmin(false)}>← Back to store</button><span className="eyebrow">STORE SETTINGS</span><h1>Owner setup</h1><p className="muted">These settings are stored only in this browser. Add a real backend before accepting live orders.</p><label>Store name<input value={shopName} onChange={e=>setShopName(e.target.value)}/></label><label>WhatsApp number with country code (optional)<input value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} placeholder="91XXXXXXXXXX"/></label><label>Delivery fee (₹)<input type="number" min="0" value={deliveryFee} onChange={e=>setDeliveryFee(Math.max(0,Number(e.target.value)||0))}/></label><h2>Products preview</h2><div className="admin-products">{catalog.map(p=><div key={p.id}><span>{p.emoji} {p.name}</span><b>{money(p.price)}</b></div>)}</div><p className="notice">This starter admin screen is local-only; it does not sync changes across customers.</p></section>}
    </main>
    <footer><div className="footer-brand">🛍️ {shopName}</div><span>Made for your neighbourhood.</span><button onClick={()=>setAdmin(true)}>Owner setup</button></footer>
    {showCart&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCart(false)}}><aside className="cart-drawer"><div className="drawer-head"><div><span className="eyebrow">YOUR BASKET</span><h2>Shopping cart ({count})</h2></div><button className="icon-button" onClick={()=>setShowCart(false)}><X/></button></div>{count===0?<div className="empty-cart"><span>🧺</span><h3>Your basket is empty</h3><p>Add something fresh to get started.</p><button className="primary-button" onClick={()=>setShowCart(false)}>Browse products</button></div>:<><div className="cart-items">{catalog.filter(p=>cart[p.id]).map(p=><div className="cart-item" key={p.id}><div className="mini-product">{p.emoji}</div><div className="cart-item-main"><b>{p.name}</b><small>{p.unit} · {money(p.price)}</small><div className="quantity"><button onClick={()=>change(p.id,-1)}><Minus size={13}/></button><b>{cart[p.id]}</b><button onClick={()=>add(p.id)}><Plus size={13}/></button></div></div><strong>{money(p.price*cart[p.id])}</strong><button className="remove-button" onClick={()=>setCart(c=>{const n={...c};delete n[p.id];return n})}><Trash2 size={15}/></button></div>)}</div><div className="cart-bottom"><div className="bill-line"><span>Subtotal</span><b>{money(subtotal)}</b></div><div className="bill-line"><span>Delivery fee</span><b>{money(deliveryFee)}</b></div><div className="bill-line bill-total"><span>Total</span><b>{money(subtotal+deliveryFee)}</b></div><button className="primary-button full" onClick={()=>{setShowCart(false);setCheckout(true)}}>Proceed to checkout <ChevronRight size={18}/></button><small className="muted">UPI QR payment is available after order placement.</small></div></>}</aside></div>}
    {checkout&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCheckout(false)}}><section className="checkout-modal"><div className="drawer-head"><div><span className="eyebrow">ALMOST THERE</span><h2>Delivery details</h2></div><button className="icon-button" onClick={()=>setCheckout(false)}><X/></button></div><form onSubmit={submitOrder}><label>Full name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label><label>Mobile number<input required inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="10-digit phone number"/></label><label>Delivery address<textarea required value={address} onChange={e=>setAddress(e.target.value)} placeholder="House, street, area, landmark"/></label><label>Delivery note (optional)<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any directions for delivery"/></label><div className="bill-line bill-total"><span>Pay by UPI QR after placing order</span><b>{money(subtotal+deliveryFee)}</b></div><button className="primary-button full" type="submit" disabled={placingOrder}>{placingOrder?'Saving your order…':'Place order · Continue to UPI payment'} <ChevronRight size={18}/></button><p className="notice">Your order is saved first. After placing it, scan the QR and submit payment proof through WhatsApp.</p></form></section></div>}
    {toast&&<div className="toast">{toast}</div>}
  </div>
}
createRoot(document.getElementById('root')).render(<App />)
