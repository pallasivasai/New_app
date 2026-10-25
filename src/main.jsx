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

function App(){
  const [cart,setCart] = useState({})
  const [catalog,setCatalog] = useState(products)
  const [dbConnected,setDbConnected] = useState(false)
  const [placingOrder,setPlacingOrder] = useState(false)
  const [creatingGatewayPayment,setCreatingGatewayPayment] = useState(false)
  const [category,setCategory] = useState('All')
  const [search,setSearch] = useState('')
  const [showCart,setShowCart] = useState(false)
  const [checkout,setCheckout] = useState(false)
  const [name,setName] = useState('')
  const [phone,setPhone] = useState('')
  const [address,setAddress] = useState('')
  const [notes,setNotes] = useState('')
  const [paymentMethod,setPaymentMethod] = useState('upi_qr')
  const [order,setOrder] = useState(()=>{ try { const saved=localStorage.getItem('localBasketLastOrder'); return saved?JSON.parse(saved):null } catch { return null } })
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
  useEffect(()=>{
    if(!order?.dbId || !order?.phone || order.paymentMethod==='cash_on_delivery' || order.paymentProvider!=='youpi_pg' || ['paid','failed'].includes(order.paymentStatus)) return
    let alive=true
    const checkStatus=async()=>{
      const {data,error}=await supabase.functions.invoke('check-youpi-payment',{body:{order_id:order.dbId,customer_phone:order.phone}})
      if(!alive||error||data?.error||!data?.payment_status) return
      setOrder(current=>{
        if(!current||current.dbId!==order.dbId) return current
        const next={...current,paymentStatus:data.payment_status,paymentProvider:data.payment_provider||current.paymentProvider}
        try{localStorage.setItem('localBasketLastOrder',JSON.stringify(next))}catch{}
        return next
      })
    }
    checkStatus()
    const timer=setInterval(checkStatus,5000)
    return ()=>{alive=false;clearInterval(timer)}
  },[order?.dbId,order?.phone,order?.paymentMethod,order?.paymentProvider,order?.paymentStatus])
  const submitOrder = async e => {
    e.preventDefault()
    if(!name.trim()||phone.replace(/\D/g,'').length<10||!address.trim()){notify('Please enter your name, valid phone and delivery address.');return}
    if(!dbConnected){notify('Database is not reachable yet. Please retry in a moment.');return}
    const items = catalog.filter(p=>cart[p.id]).map(p=>({product_id:Number(p.id),quantity:cart[p.id]}))
    if(!items.length){notify('Your cart is empty.');return}
    setPlacingOrder(true)
    const {data,error} = await supabase.functions.invoke('create-order',{body:{
      customer_name:name,customer_phone:phone,delivery_address:address,delivery_notes:notes,
      payment_method:paymentMethod,delivery_fee:deliveryFee,items
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
      status:'Order received',paymentMethod:dbOrder.payment_method || paymentMethod,paymentStatus:dbOrder.payment_status,paymentProvider:dbOrder.payment_provider,paymentReference:dbOrder.payment_reference,paymentCheckoutUrl:data.payment?.checkoutUrl || dbOrder.payment_checkout_url || null,createdAt:new Date(dbOrder.created_at).toLocaleString()
    }
    setOrder(newOrder);setCart({});setCheckout(false);setShowCart(false);notify(paymentMethod==='cash_on_delivery'?'COD order placed successfully!':'Order saved. Start secure hosted checkout to pay by UPI.')
    try { localStorage.setItem('localBasketLastOrder',JSON.stringify(newOrder)); } catch {}
  }
  const startYoupiCheckout = () => {
    if(!order || order.paymentMethod==='cash_on_delivery') return
    if(!order.paymentCheckoutUrl){
      notify('Secure checkout is not available. The owner must configure the YouPI gateway secrets in Supabase.')
      return
    }
    window.location.assign(order.paymentCheckoutUrl)
  }
  const shareOrder = () => {
    if(!order)return
    const text=`${shopName} order ${order.id}\\n${order.items.map(i=>`${i.name} x${i.qty} - ${money(i.price*i.qty)}`).join('\\n')}\\nTotal: ${money(order.total)}\\nCustomer: ${order.name}, ${order.phone}\\nAddress: ${order.address}`
    if(whatsapp.trim()) window.open(`https://wa.me/${whatsapp.replace(/\\D/g,'')}?text=${encodeURIComponent(text)}`,'_blank')
    else if(navigator.share) navigator.share({title:'Grocery order '+order.id,text}).catch(()=>{})
    else {navigator.clipboard?.writeText(text);notify('Order summary copied if clipboard is available.')}
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
          <div className="order-status"><span className="status-dot"></span>{order.paymentStatus==='paid'?'Payment verified':order.paymentProvider==='youpi_pg'?'Waiting for YouPI payment confirmation':'Order received — payment pending'}<small>{order.createdAt}</small></div>
          {order.items.map(i=><div className="order-line" key={i.id}><span>{i.emoji} {i.name} × {i.qty}</span><b>{money(i.price*i.qty)}</b></div>)}
          <div className="order-line"><span>Delivery fee</span><b>{money(order.deliveryFee)}</b></div>
          <div className="order-total"><span>Total to pay</span><b>{money(order.total)}</b></div>
          <p className="address-line"><MapPin size={15}/>{order.address}</p>
        </div>
        {order.paymentMethod==='cash_on_delivery' ? <div className="payment-panel"><span className="eyebrow">CASH ON DELIVERY</span><h2>Pay when your order arrives</h2><p>Your order is confirmed as a COD request. Please pay ₹{Number(order.total).toFixed(0)} to the delivery person when your groceries arrive.</p><div className="tracking-panel"><h3><PackageCheck size={18}/> Order tracking</h3><p className="tracking-status">Order received · Cash payment due on delivery</p><div className="tracking-steps"><span className="active">Order received</span><span>Preparing</span><span>Out for delivery</span><span>Delivered</span></div><small>Delivery updates will be shown here as the store updates your order.</small></div></div> : <div className="payment-panel">
          <span className="eyebrow">SECURE UPI CHECKOUT</span>
          <h2>{order.paymentStatus==='paid'?'Payment successful':`Pay ${money(order.total)} using YouPI`}</h2>
          <p>{order.paymentStatus==='paid'?'Your payment was confirmed by the signed gateway webhook.':'Continue to YouPI hosted checkout to scan the dynamic QR or open your supported UPI app. Payment status updates automatically after server verification.'}</p>
          {order.paymentStatus!=='paid'&&<button className="primary-button full" onClick={startYoupiCheckout}>{'Continue to secure UPI payment'} <ChevronRight size={18}/></button>}
          {order.paymentStatus==='paid'&&<div className="tracking-panel"><h3><PackageCheck size={18}/> Payment verified</h3><p className="tracking-status">Payment confirmed by gateway</p><small>Local Basket received a verified server-side payment event. Keep your order number for reference.</small></div>}
          {order.paymentStatus!=='paid'&&<div className="payment-instructions"><b>How payment confirmation works</b><ol><li>Tap “Continue to secure UPI payment”.</li><li>Complete the payment on the hosted YouPI checkout page.</li><li>Return to Local Basket. This order page checks payment status automatically.</li></ol><p className="muted">This order remains pending until the gateway's signed webhook confirms the exact order and amount. Screenshots and browser callbacks do not mark an order paid.</p></div>}
          {order.paymentStatus!=='paid'&&<div className="tracking-panel"><h3><PackageCheck size={18}/> Order tracking</h3><p className="tracking-status">{order.paymentProvider==='youpi_pg'?'Payment initiated · Waiting for signed gateway confirmation':'Order received · Hosted checkout setup may be required'}</p><div className="tracking-steps"><span className="active">Order received</span><span>Payment confirmation</span><span>Preparing</span><span>Out for delivery</span><span>Delivered</span></div><small>Live delivery location is not enabled yet. The store should only prepare the order after payment is verified or COD is accepted.</small></div>}
        </div>}
        <button className="secondary-button" onClick={shareOrder}>Share order summary</button>
        <button className="text-button" onClick={()=>{setOrder(null);try{localStorage.removeItem('localBasketLastOrder')}catch{};setCategory('All')}}>Continue shopping</button>
      </section>}
      {admin&&<section className="admin-page"><button className="text-button" onClick={()=>setAdmin(false)}>← Back to store</button><span className="eyebrow">STORE SETTINGS</span><h1>Owner setup</h1><p className="muted">These settings are stored only in this browser. Add a real backend before accepting live orders.</p><label>Store name<input value={shopName} onChange={e=>setShopName(e.target.value)}/></label><label>WhatsApp number with country code (optional)<input value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} placeholder="91XXXXXXXXXX"/></label><label>Delivery fee (₹)<input type="number" min="0" value={deliveryFee} onChange={e=>setDeliveryFee(Math.max(0,Number(e.target.value)||0))}/></label><h2>Products preview</h2><div className="admin-products">{catalog.map(p=><div key={p.id}><span>{p.emoji} {p.name}</span><b>{money(p.price)}</b></div>)}</div><p className="notice">This starter admin screen is local-only; it does not sync changes across customers.</p></section>}
    </main>
    <footer><div className="footer-brand">🛍️ {shopName}</div><span>Made for your neighbourhood.</span><button onClick={()=>setAdmin(true)}>Owner setup</button></footer>
    {showCart&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCart(false)}}><aside className="cart-drawer"><div className="drawer-head"><div><span className="eyebrow">YOUR BASKET</span><h2>Shopping cart ({count})</h2></div><button className="icon-button" onClick={()=>setShowCart(false)}><X/></button></div>{count===0?<div className="empty-cart"><span>🧺</span><h3>Your basket is empty</h3><p>Add something fresh to get started.</p><button className="primary-button" onClick={()=>setShowCart(false)}>Browse products</button></div>:<><div className="cart-items">{catalog.filter(p=>cart[p.id]).map(p=><div className="cart-item" key={p.id}><div className="mini-product">{p.emoji}</div><div className="cart-item-main"><b>{p.name}</b><small>{p.unit} · {money(p.price)}</small><div className="quantity"><button onClick={()=>change(p.id,-1)}><Minus size={13}/></button><b>{cart[p.id]}</b><button onClick={()=>add(p.id)}><Plus size={13}/></button></div></div><strong>{money(p.price*cart[p.id])}</strong><button className="remove-button" onClick={()=>setCart(c=>{const n={...c};delete n[p.id];return n})}><Trash2 size={15}/></button></div>)}</div><div className="cart-bottom"><div className="bill-line"><span>Subtotal</span><b>{money(subtotal)}</b></div><div className="bill-line"><span>Delivery fee</span><b>{money(deliveryFee)}</b></div><div className="bill-line bill-total"><span>Total</span><b>{money(subtotal+deliveryFee)}</b></div><button className="primary-button full" onClick={()=>{setShowCart(false);setCheckout(true)}}>Proceed to checkout <ChevronRight size={18}/></button><small className="muted">UPI QR payment is available after order placement.</small></div></>}</aside></div>}
    {checkout&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCheckout(false)}}><section className="checkout-modal"><div className="drawer-head"><div><span className="eyebrow">ALMOST THERE</span><h2>Delivery details</h2></div><button className="icon-button" onClick={()=>setCheckout(false)}><X/></button></div><form onSubmit={submitOrder}><label>Full name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label><label>Mobile number<input required inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="10-digit phone number"/></label><label>Delivery address<textarea required value={address} onChange={e=>setAddress(e.target.value)} placeholder="House, street, area, landmark"/></label><label>Delivery note (optional)<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any directions for delivery"/></label><div className="payment-method-picker"><span className="eyebrow">PAYMENT METHOD</span><label className={'payment-method-option '+(paymentMethod==='upi_qr'?'selected':'')}><input type="radio" name="paymentMethod" value="upi_qr" checked={paymentMethod==='upi_qr'} onChange={()=>setPaymentMethod('upi_qr')}/><span><b>Pay by UPI via YouPI</b><small>Hosted checkout with server-side payment confirmation</small></span></label><label className={'payment-method-option '+(paymentMethod==='cash_on_delivery'?'selected':'')}><input type="radio" name="paymentMethod" value="cash_on_delivery" checked={paymentMethod==='cash_on_delivery'} onChange={()=>setPaymentMethod('cash_on_delivery')}/><span><b>Cash on Delivery (COD)</b><small>Pay cash when your order is delivered</small></span></label></div><div className="bill-line bill-total"><span>{paymentMethod==='cash_on_delivery'?'Cash due on delivery':'Pay by UPI QR after placing order'}</span><b>{money(subtotal+deliveryFee)}</b></div><button className="primary-button full" type="submit" disabled={placingOrder}>{placingOrder?'Saving your order…':paymentMethod==='cash_on_delivery'?'Place COD order':'Place order · Continue to UPI payment'} <ChevronRight size={18}/></button><p className="notice">{paymentMethod==='cash_on_delivery'?'Pay the delivery person when your groceries arrive.':'Your order is saved first. Continue to hosted YouPI checkout; payment is confirmed only by a signed webhook.'}</p></form></section></div>}
    {toast&&<div className="toast">{toast}</div>}
  </div>
}
createRoot(document.getElementById('root')).render(<App />)
