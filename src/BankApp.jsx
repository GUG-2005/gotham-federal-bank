import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowLeftRight, ArrowUpRight, BadgeCheck, Bell,
  CheckCircle2, ChevronDown, CircleHelp, Clock3, Download, HandCoins, Landmark,
  LayoutDashboard, LockKeyhole, LogOut, Menu, Plus, ReceiptText, RefreshCw, Send,
  Settings2, ShieldCheck, ShieldHalf, UserCircle2, UserRoundPlus, Users, Wallet, X, XCircle,
} from 'lucide-react';
import bank from './bank-config';
import { toPaise } from './amount';
import { configuredEndpoint, liveApi, readStorage, saveStorage } from './live-api';
import { portalApi, portalBase } from './portal-api';
import './BankApp.css';

const worker = configuredEndpoint;
const prefix = `/banks/${bank.id}`;
const rupees = (minor) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format((Number(minor) || 0) / 100);
const stamp = (s) => { try { return s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; } catch { return '—'; } };
const date = (s) => { try { return s ? new Date(s).toLocaleDateString('en-IN', {dateStyle:'medium'}) : '—'; } catch { return '—'; } };
const normAccount = (a) => ({ ...a, accountId: a.accountId || a.id, accountNumber: a.accountNumber || a.accountId,
  balanceMinor: a.availableMinor ?? ((a.postedBalanceMinor || 0) - (a.heldMinor || 0)),
  availableMinor: a.availableMinor ?? ((a.postedBalanceMinor || 0) - (a.heldMinor || 0)) });
const normTransfer = (t) => ({ ...t, id: t.transferId || t.id, fromUid: t.fromUid || t.customerUid,
  destBank: t.destinationBankId || t.destBank || 'Destination account',
  toAccount: t.destinationAccountNumber || t.toAccount || '', createdAt: t.createdAt, amountMinor: t.amountMinor || 0 });
const normalize = (items) => Array.isArray(items) ? items : [];
const initial = { accounts: [], transfers: [], beneficiaries: [], loans: [], announcements: [], users: [], kyc: [], limits: {} };
const csvDownload = (filename, cols, rows) => {
  const escape = v => `"${String(v ?? '').replaceAll('"','""')}"`;
  const data = [cols,...rows].map(r=>r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
};
function Status({children}) { const code=String(children||'UNKNOWN').toLowerCase(); return <span className={`demo-status status-${code.replaceAll(' ','-')}`}><span className="demo-status-dot"/>{children}</span>; }
function Initials({name}) {return <span className="demo-avatar">{String(name||'G').split(' ').filter(Boolean).slice(0,2).map(v=>v[0]?.toUpperCase()).join('')}</span>;}
function Heading({eyebrow,title,subtitle,action}) {return <div className="demo-heading"><div><span className="demo-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="demo-heading-action">{action}</div>}</div>;}
function Empty({icon:Icon=ReceiptText,title='Nothing here yet',body='No records returned.'}) {return <div className="demo-empty"><span><Icon size={25}/></span><h3>{title}</h3><p>{body}</p></div>;}
function Button({icon:Icon,children,onClick,variant='neutral',disabled=false,type='button'}) {return <button type={type} disabled={disabled} onClick={onClick} className={`demo-btn btn-${variant}`}>{Icon && <Icon size={17}/>} {children}</button>;}
function Table({headings,rows,empty='No records available'}) {return <div className="demo-table-wrap"><table className="demo-table"><thead><tr>{headings.map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{rows.length ? rows.map((r,i)=><tr key={i}>{r.map((cell,j)=><td key={j}>{cell}</td>)}</tr>) : <tr><td colSpan={headings.length} className="demo-table-empty">{empty}</td></tr>}</tbody></table></div>;}
function Alert({children,kind='warning'}){return <div className={`demo-alert ${kind}`}><CircleHelp size={18}/>{children}</div>;}
const customerNav = [['overview','Overview',LayoutDashboard],['accounts','My accounts',Wallet],['transfer','Send money',ArrowLeftRight],['beneficiaries','Beneficiaries',Users],['transactions','Transactions',ReceiptText],['loans','Loans',HandCoins],['profile','My profile',UserCircle2]];
const adminNav = [['overview','Overview',LayoutDashboard],['customers','Customers',Users],['kyc','KYC approvals',BadgeCheck],['accounts','Bank accounts',Wallet],['transfers','Transfers',ArrowLeftRight],['loans','Loan requests',HandCoins],['announcements','Announcements',Bell],['settings','Settings',Settings2]];
function Auth({mode,setMode,onLogin,onRegister,error,busy}){
  const [screen,setScreen] = useState('login');
  const [form,setForm] = useState({email:'',password:'',confirm:'',name:'',phone:'',documentType:'PAN',documentRefLast4:''});
  useEffect(()=>{setScreen('login');setForm({email:'',password:'',confirm:'',name:'',phone:'',documentType:'PAN',documentRefLast4:''});},[mode]);
  const edit=(key,v)=>setForm(f=>({...f,[key]:v}));
  const submit=(e)=>{e.preventDefault();if(screen==='signup')onRegister(form,()=>{setScreen('login');edit('password','');});else onLogin(form.email,form.password,mode);};
  return <div className="demo-auth"><div className="demo-auth-intro"><div className="demo-auth-brand"><span className="demo-logo"><Landmark size={23}/></span><strong>GOTHAM <span>FEDERAL</span></strong><small>BANK</small></div>
    <div className="demo-auth-story"><span className="demo-glass-label"><ShieldCheck size={16}/> Your banking, reimagined</span><h1>Banking that<br/>moves <em>with you.</em></h1><p>A modern banking experience, crafted for clarity. Manage accounts, move funds and stay in control.</p>
    <div className="demo-float-card"><div><span className="demo-float-icon"><Wallet size={20}/></span><span>GOTHAM FEDERAL BANK</span></div><small>PERSONAL FINANCE</small><strong>Your account.<br/>Your control.</strong><footer><span>SECURE ACCESS</span><span>P628</span></footer></div><div className="demo-auth-checks"><span><CheckCircle2 size={17}/> Verified account access</span><span><ShieldCheck size={17}/> Real API connections</span></div></div>
    <div className="demo-auth-foot">© Gotham Federal Bank · P628 <span>Banking customer experience</span></div></div>
    <div className="demo-auth-pane"><div className="demo-auth-form-wrap"><div className="demo-mode-label"><span className="demo-pulse"/> BANKING PORTAL · SECURE SIGN IN</div><h2>{screen==='signup'?'Create your account':mode==='admin'?'Administrator sign in':'Welcome back'}</h2><p className="demo-form-subtitle">{screen==='signup'?'Registration will be submitted for bank review.':mode==='admin'?'Administrative access is verified by the bank backend.':'Sign in with your existing bank credentials.'}</p>
    <div className="demo-auth-switch"><button type="button" className={mode==='customer'?'selected':''} onClick={()=>setMode('customer')}><UserCircle2 size={16}/> Customer</button><button type="button" className={mode==='admin'?'selected':''} onClick={()=>setMode('admin')}><ShieldHalf size={16}/> Administrator</button></div>
    {error && <Alert kind="error">{error}</Alert>}
    <form className="demo-stack" onSubmit={submit}>{screen==='signup' && <><label>Full name<input required minLength={2} value={form.name} onChange={e=>edit('name',e.target.value)}/></label><label>Phone number<input required pattern="[0-9]{10}" value={form.phone} onChange={e=>edit('phone',e.target.value)}/></label></>}
      <label>Email<input required type="email" autoComplete="username" value={form.email} onChange={e=>edit('email',e.target.value)} placeholder="you@example.com"/></label>
      <label>Password<input required type="password" autoComplete={screen==='signup'?'new-password':'current-password'} minLength={screen==='signup'?8:undefined} value={form.password} onChange={e=>edit('password',e.target.value)}/></label>
      {screen==='signup' && <><label>Confirm password<input required type="password" autoComplete="new-password" minLength={8} value={form.confirm} onChange={e=>edit('confirm',e.target.value)}/></label><label>Identity document type<select value={form.documentType} onChange={e=>edit('documentType',e.target.value)}><option value="PAN">PAN</option><option value="AADHAAR">Aadhaar</option><option value="PASSPORT">Passport</option></select></label><label>Last four characters of document reference<input required maxLength={4} minLength={4} pattern="[A-Za-z0-9]{4}" value={form.documentRefLast4} onChange={e=>edit('documentRefLast4',e.target.value)} placeholder="Last 4 only"/></label><p className="demo-hint">Registration requires the additional authenticated bank API. Do not enter a full identity document number.</p></>}
      <button disabled={busy} className="demo-primary-wide" type="submit">{busy?'Processing…':screen==='signup'?'Submit registration':'Sign in'} <ArrowRight size={18}/></button></form>
    {mode==='customer' && <p className="demo-auth-secondary">{screen==='signup'?'Already registered?':'New to Gotham?'} <button type="button" onClick={()=>setScreen(s=>s==='login'?'signup':'login')}>{screen==='signup'?'Sign in':'Create a customer account'}</button></p>}
    <div className="demo-auth-links"><span>No default passwords or demo credentials are included.</span><a href="#/live">Original banking view <ArrowUpRight size={14}/></a></div></div></div></div>;
}
function Shell({user,role,page,setPage,onLogout,onRefresh,children,requests}){
  const [mobile,setMobile]=useState(false);const nav=role==='admin'?adminNav:customerNav;
  const current=nav.find(x=>x[0]===page)||nav[0];
  return <div className="demo-app"><aside className={`demo-sidebar ${mobile?'mobile-open':''}`}><div className="demo-sidebar-brand"><span className="demo-logo"><Landmark size={23}/></span><div><b>GOTHAM</b><b>FEDERAL BANK</b><small>PRIVATE BANKING · P628</small></div><button className="demo-close-mobile" onClick={()=>setMobile(false)} aria-label="Close menu"><X size={20}/></button></div><div className="demo-sidebar-category">WORKSPACE</div>
    <nav className="demo-nav">{nav.map(([key,label,Icon])=><button type="button" key={key} className={page===key?'active':''} onClick={()=>{setPage(key);setMobile(false);}}><Icon size={19}/><span>{label}</span>{role==='admin'&&key==='kyc'&&requests>0&&<i>{requests}</i>}</button>)}</nav>
    <div className="demo-sidebar-bottom"><div className="demo-sidebar-support"><span><ShieldCheck size={22}/></span><strong>Connected banking</strong><p>Data comes from authenticated APIs. Existing Worker integration remains in place.</p></div><button className="demo-sidebar-signout" onClick={onLogout}><LogOut size={18}/> Sign out</button></div></aside>{mobile&&<button className="demo-sidebar-backdrop" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
    <div className="demo-workspace"><header className="demo-topbar"><div className="demo-topbar-left"><button className="demo-mobile-toggle" onClick={()=>setMobile(true)} aria-label="Open menu"><Menu size={21}/></button><span className="demo-breadcrumb">Workspace</span><span className="demo-breadcrumb-sep">/</span><strong>{current[1]}</strong></div><div className="demo-topbar-right"><button className="demo-btn" onClick={onRefresh}><RefreshCw size={16}/> Refresh</button><span className="demo-environment"><span/> API-DRIVEN</span><div className="demo-topbar-avatar"><Initials name={user.name}/><div><b>{user.name}</b><small>{role==='admin'?'Administrator':'Personal banking'}</small></div><ChevronDown size={15}/></div></div></header><main className="demo-main">{children}</main><footer className="demo-footer"><span>© {new Date().getFullYear()} Gotham Federal Bank</span><span>Bank P628 • Data supplied by connected bank APIs</span></footer></div></div>;
}
function Block({title,subtitle,children,action}){return <section className="demo-panel"><div className="demo-panel-title"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>;}
function Kpi({icon:Icon,color='stat-blue',label,value,note}){return <div className="demo-stat"><span className={`demo-stat-icon ${color}`}><Icon size={20}/></span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></div>;}
function CustomerHome({user,data,setPage}){
  const accounts=data.accounts;const total=accounts.reduce((s,a)=>s+(a.availableMinor||0),0);const recent=data.transfers.slice(0,5);
  return <><Heading eyebrow="PERSONAL BANKING" title={`Welcome, ${user.name.split(' ')[0]}`} subtitle="Your accounts, transactions and financial services in one place." action={<Button icon={Send} variant="primary" onClick={()=>setPage('transfer')}>Send money</Button>}/>
    <div className="demo-dashboard-grid"><section className="demo-hero-balance"><div className="demo-balance-top"><span><span className="demo-balance-icon"><Wallet size={19}/></span> TOTAL AVAILABLE BALANCE</span><Landmark size={22}/></div><div className="demo-balance-value">{rupees(total)}</div><div className="demo-balance-sub">{accounts.length?`${accounts.length} account(s) · ${accounts[0].accountNumber}`:'No linked accounts yet'}</div><div className="demo-balance-footer"><span><span className="demo-green-dot"/>{accounts.some(a=>a.status==='ACTIVE')?'ACTIVE':'PENDING'} ACCOUNT</span><button onClick={()=>setPage('accounts')}>View accounts <ArrowUpRight size={16}/></button></div></section>
    <section className="demo-action-card"><div><h3>Move money, simply.</h3><p>Transfer to another bank account, view beneficiaries or inspect account activity.</p></div><div className="demo-quick-actions"><button onClick={()=>setPage('transfer')}><span className="quick-blue"><ArrowUpRight size={21}/></span>Transfer</button><button onClick={()=>setPage('beneficiaries')}><span className="quick-lilac"><UserRoundPlus size={21}/></span>Beneficiaries</button><button onClick={()=>setPage('transactions')}><span className="quick-mint"><ReceiptText size={21}/></span>Activity</button></div></section></div>
    <div className="demo-stats-row"><Kpi icon={Wallet} label="Accounts" value={String(accounts.length)} note="Fetched from bank"/><Kpi icon={ArrowUpRight} color="stat-purple" label="Recorded transfers" value={String(data.transfers.length)} note="Latest returned activity"/><Kpi icon={ShieldCheck} color="stat-mint" label="Verification" value={user.status} note="Based on bank profile"/></div>
    <div className="demo-two-cols"><Block title="Recent activity" subtitle="Bank-reported transactions" action={<button className="demo-text-button" onClick={()=>setPage('transactions')}>View all <ArrowRight size={16}/></button>}>{recent.length?recent.map(t=><div className="demo-tx-item" key={t.id}><span className="demo-tx-icon debit"><ArrowUpRight size={19}/></span><div className="demo-tx-description"><strong>{t.destBank}</strong><small>{stamp(t.createdAt)} · {t.type||'Transfer'}</small></div><div className="demo-tx-amount"><strong>{rupees(t.amountMinor)}</strong><small>{t.status}</small></div></div>):<Empty title="No activity yet" body="Bank-reported transfers will appear here."/>}</Block>
    <Block title="Bank announcements" subtitle="Your latest messages">{data.announcements.length?data.announcements.slice(0,3).map(n=><div className="demo-notice" key={n.id}><span className="demo-notice-icon"><Bell size={18}/></span><div><strong>{n.title}</strong><p>{n.body}</p><small>{date(n.createdAt)}</small></div></div>):<Empty icon={Bell} title="No announcements" body="Notices will appear when published by the bank."/>}</Block></div></>;
}
function CustomerAccounts({user,data}){return <><Heading eyebrow="ACCOUNT DETAILS" title="My accounts" subtitle="Balances and status are fetched from the existing Worker API."/><div className="demo-two-cols align-start">{data.accounts.length?data.accounts.map(a=><Block key={a.accountId} title={a.accountNumber} action={<Status>{a.status}</Status>}><div className="demo-account-detail"><span className="demo-detail-label">AVAILABLE BALANCE</span><strong className="demo-account-big">{rupees(a.availableMinor)}</strong><div className="demo-info-grid"><div><small>Account holder</small><b>{user.name}</b></div><div><small>Account ID</small><b>{a.accountId}</b></div><div><small>IFSC</small><b>{bank.ifsc}</b></div><div><small>Bank</small><b>{bank.name}</b></div><div><small>Held balance</small><b>{rupees(a.heldMinor)}</b></div><div><small>Currency</small><b>{a.currency||'INR'}</b></div></div></div></Block>):<Block title="No account found"><Empty icon={Wallet} title="No linked account" body="Complete registration and wait for KYC approval, or ask the bank to link your Firebase UID."/></Block>}</div></>}
function CustomerTransfer({data,onSend,loading,workerAvailable}){
  const [type,setType]=useState('interbank'),[from,setFrom]=useState(''),[dest,setDest]=useState(''),[number,setNumber]=useState(''),[amount,setAmount]=useState('');
  const sources=data.accounts.filter(a=>a.status==='ACTIVE');const source=sources.find(a=>a.accountId===from)||sources[0];const routes=data.directory.filter(x=>x.bankId!==bank.id&&x.status==='ACTIVE');
  const target=type==='internal'?bank.ifsc:(routes.find(r=>r.ifsc===dest)?.ifsc||routes[0]?.ifsc||'');
  function submit(e){e.preventDefault();const amountMinor=toPaise(amount);if(!amountMinor||!target||!number.trim()||!source)return;onSend({fromAccountId:source.accountId,destinationIfsc:target,destinationAccountNumber:number.trim(),amountMinor,currency:'INR'}).then(()=>{setNumber('');setAmount('');}).catch(()=>{});}
  return <><Heading eyebrow="PAYMENTS & TRANSFERS" title="Send money" subtitle="Transfers use the original Cloudflare Worker and Firestore banking backend."/><div className="demo-two-cols align-start"><Block title="New transfer" subtitle="Existing X42 transfer endpoint"><form className="demo-stack" onSubmit={submit}><label>Transfer type</label><div className="demo-segments"><button type="button" className={type==='internal'?'active':''} onClick={()=>setType('internal')}><Landmark size={17}/> Same bank</button><button type="button" className={type==='interbank'?'active':''} onClick={()=>setType('interbank')}><ArrowLeftRight size={17}/> Interbank</button></div><label>From account<select value={source?.accountId||''} onChange={e=>setFrom(e.target.value)} disabled={!sources.length}>{sources.map(a=><option key={a.accountId} value={a.accountId}>{a.accountNumber} · {rupees(a.availableMinor)}</option>)}</select></label>
    {type==='interbank'&&<label>Destination bank<select required value={target} onChange={e=>setDest(e.target.value)} disabled={!routes.length}>{routes.map(r=><option key={r.bankId} value={r.ifsc}>{r.bankName} · {r.ifsc}</option>)}</select></label>}
    <label>Destination account number<input required value={number} onChange={e=>setNumber(e.target.value)} placeholder="Recipient account number"/></label><label>Amount (INR)<input required value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0.00"/></label><div className="demo-send-summary"><span>Available balance</span><b>{rupees(source?.availableMinor||0)}</b></div><button type="submit" disabled={!workerAvailable||!source||!target||loading} className="demo-primary-wide">{loading?'Submitting…':'Submit transfer'} <ArrowRight size={18}/></button></form></Block>
    <Block title="Transfer information"><div className="demo-info-callout"><span><LockKeyhole size={21}/></span><div><strong>Real bank API transaction</strong><p>Transfers use your existing Worker route and its original idempotency key mechanism. Failed requests are not recorded as successful.</p></div></div><div className="demo-summary-stats"><div><span>Source bank</span><b>{bank.name}</b></div><div><span>IFSC</span><b>{bank.ifsc}</b></div><div><span>Available bank routes</span><b>{routes.length}</b></div><div><span>Status</span><b>{workerAvailable?'Worker session available':'Worker login unavailable'}</b></div></div></Block></div></>;
}
function CustomerBeneficiaries({data,token,refresh,run}){
  const [form,setForm]=useState({name:'',bankName:'',ifsc:bank.ifsc,accountNumber:''});
  return <><Heading eyebrow="PAYMENT CONTACTS" title="Beneficiaries" subtitle="Saved recipients are loaded from the authenticated bank API."/><div className="demo-two-cols align-start"><Block title="Saved beneficiaries" subtitle={`${data.beneficiaries.length} entries`}>{data.beneficiaries.length?data.beneficiaries.map(b=><div className="demo-beneficiary" key={b.id}><Initials name={b.name}/><div><strong>{b.name}</strong><small>{b.bankName} · {b.accountNumber||b.beneficiaryAccountNumber}</small></div><button title="Remove beneficiary" onClick={()=>run(()=>portalApi(`/customer/beneficiaries/${b.id}`,{token,method:'DELETE'}),'Beneficiary removed')}><X size={17}/></button></div>):<Empty icon={Users} title="No beneficiaries" body="Add a recipient using the form."/>}</Block><Block title="Add a beneficiary"><form className="demo-stack" onSubmit={e=>{e.preventDefault();run(()=>portalApi('/customer/beneficiaries',{token,method:'POST',data:form}),'Beneficiary added').then(ok=>{if(ok)setForm({name:'',bankName:'',ifsc:bank.ifsc,accountNumber:''});});}}>{[['name','Beneficiary name'],['bankName','Destination bank'],['ifsc','IFSC'],['accountNumber','Account number']].map(([key,label])=><label key={key}>{label}<input required value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}<button className="demo-primary-wide" disabled={!token}>Save beneficiary <Plus size={17}/></button></form></Block></div></>;
}
function CustomerTransactions({data}){const [filter,setFilter]=useState('all');const rows=data.transfers.filter(t=>filter==='all'||(filter==='received'?t.direction==='CREDIT':t.direction!=='CREDIT'));return <><Heading eyebrow="YOUR FINANCIAL ACTIVITY" title="Transactions" subtitle="Bank-reported transfer activity" action={<Button icon={Download} onClick={()=>csvDownload('gotham-transactions.csv',['Reference','Date','Route','Amount (INR)','Status'],rows.map(t=>[t.id,stamp(t.createdAt),t.destBank,(t.amountMinor/100).toFixed(2),t.status]))}>Export CSV</Button>}/><Block title="Transaction history" action={<div className="demo-tabs">{[['all','All'],['sent','Sent'],['received','Received']].map(([key,label])=><button key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}>{label}</button>)}</div>}><Table headings={['Reference','Date','Bank / Route','Amount','Status']} rows={rows.map(t=>[<b>{t.id}</b>,stamp(t.createdAt),t.destBank,<b>{rupees(t.amountMinor)}</b>,<Status>{t.status||'PENDING'}</Status>])}/></Block></>}
function CustomerLoans({data,token,run}){const [type,setType]=useState('Personal loan'),[amount,setAmount]=useState(''),[months,setMonths]=useState(12);return <><Heading eyebrow="FINANCIAL SERVICES" title="Loans & requests" subtitle="Submit an application for administrator review. Approval does not disburse funds."/><div className="demo-two-cols align-start"><Block title="New loan application"><form className="demo-stack" onSubmit={e=>{e.preventDefault();run(()=>portalApi('/customer/loans',{token,method:'POST',data:{type,amountMinor:toPaise(amount),months:Number(months)}}),'Loan application submitted').then(ok=>{if(ok)setAmount('');});}}><label>Loan type<select value={type} onChange={e=>setType(e.target.value)}>{['Personal loan','Education loan','Vehicle loan','Home loan'].map(v=><option key={v}>{v}</option>)}</select></label><label>Requested amount (INR)<input value={amount} onChange={e=>setAmount(e.target.value)} required/></label><label>Preferred term<select value={months} onChange={e=>setMonths(Number(e.target.value))}>{[6,12,24,36,60].map(v=><option key={v} value={v}>{v} months</option>)}</select></label><button className="demo-primary-wide" disabled={!token}>Submit application <ArrowRight size={17}/></button></form></Block><Block title="My applications">{data.loans.length?data.loans.map(l=><div key={l.id} className="demo-loan-item"><div><strong>{l.type}</strong><small>{date(l.createdAt)} · {l.months} months</small></div><b>{rupees(l.amountMinor)}</b><Status>{l.status}</Status></div>):<Empty icon={HandCoins} title="No applications" body="Your submitted applications will be listed here."/>}</Block></div></>}
function CustomerProfile({user,token,run}){const [name,setName]=useState(user.name),[phone,setPhone]=useState(user.phone||'');useEffect(()=>{setName(user.name);setPhone(user.phone||'');},[user.uid]);return <><Heading eyebrow="PERSONAL DETAILS" title="My profile" subtitle="Personal details associated with your bank identity."/><div className="demo-two-cols align-start"><Block title="Account holder"><div className="demo-info-grid"><div><small>Email</small><b>{user.email}</b></div><div><small>Role</small><b>Customer</b></div><div><small>Bank ID</small><b>P628</b></div><div><small>Account status</small><Status>{user.status}</Status></div></div></Block><Block title="Edit profile" subtitle="Available for new portal registrations"><form className="demo-stack" onSubmit={e=>{e.preventDefault();run(()=>portalApi('/customer/profile',{token,method:'PATCH',data:{name,phone}}),'Profile updated');}}><label>Name<input value={name} required onChange={e=>setName(e.target.value)}/></label><label>Phone number<input value={phone} required pattern="[0-9]{10}" onChange={e=>setPhone(e.target.value)}/></label><button className="demo-primary-wide" disabled={!token}>Save profile</button></form></Block></div></>}
function AdminHome({data,setPage}){const pending=data.kyc.filter(k=>['PENDING','HOLD'].includes(k.status));return <><Heading eyebrow="BANK OPERATIONS" title="Administration overview" subtitle="Bank-level records retrieved through your protected administration API." action={<Button icon={RefreshCw} variant="primary" onClick={()=>setPage('kyc')}>Review KYC</Button>}/><div className="demo-admin-stats"><Kpi icon={Users} label="Customers" value={data.users.length} note="Latest users"/><Kpi icon={Wallet} label="Accounts" value={data.accounts.length} color="stat-purple" note="Registered bank accounts"/><Kpi icon={Clock3} label="Pending KYC" value={pending.length} color="stat-orange" note="Awaiting decision"/><Kpi icon={ArrowLeftRight} label="Transfers" value={data.transfers.length} color="stat-mint" note="Recent bank activity"/></div><div className="demo-two-cols"><Block title="Latest KYC requests" action={<button className="demo-text-button" onClick={()=>setPage('kyc')}>View all <ArrowRight size={16}/></button>}><Table headings={['Customer','Status']} rows={pending.slice(0,6).map(k=>[k.uid,<Status>{k.status}</Status>])}/></Block><Block title="Recent bank announcements">{data.announcements.length?data.announcements.slice(-5).reverse().map(n=><div className="demo-notice" key={n.id}><span className="demo-notice-icon"><Bell size={18}/></span><div><strong>{n.title}</strong><p>{n.body}</p></div></div>):<Empty title="No announcements"/>}</Block></div></>}
function AdminCustomers({data}) {return <><Heading eyebrow="CUSTOMER MANAGEMENT" title="Customers" subtitle="Bank customer directory; no existing records are modified."/><Block title="Customer records"><Table headings={['Name','Email','Role','Status']} rows={data.users.filter(u=>u.role!=='admin').map(u=>[u.fullName||u.name||u.uid,u.email||'—',u.role||'customer',<Status>{u.status||'UNKNOWN'}</Status>])}/></Block></>}
function AdminKyc({data,token,run}){return <><Heading eyebrow="ONBOARDING" title="KYC approvals" subtitle="You can approve, hold or reject only registrations created through this portal API."/><Block title="Application review"><Table headings={['Customer UID','Document type','Status','Action']} rows={data.kyc.map(k=>[k.uid,k.documentType||'—',<Status>{k.status}</Status>,k.portalCreated&&['PENDING','HOLD'].includes(k.status)?<div className="demo-inline-actions">{[['APPROVED','Approve'],['HOLD','Hold'],['REJECTED','Reject']].map(([decision,label])=><button key={decision} onClick={()=>run(()=>portalApi(`/admin/kyc/${k.id}/review`,{token,method:'POST',data:{decision}}),`KYC ${decision.toLowerCase()}`)}>{label}</button>)}</div>:<span>Read-only</span>])}/></Block></>}
function AdminAccounts({data}){return <><Heading eyebrow="ACCOUNT MANAGEMENT" title="Bank accounts" subtitle="Account balances are read-only here; transfers remain controlled by the original Worker."/><Block title="Account registry"><Table headings={['Account','Owner UID','Available','Status']} rows={data.accounts.map(a=>[a.accountNumber||a.accountId,a.customerUid||a.uid||'—',rupees(a.availableMinor??((a.postedBalanceMinor||0)-(a.heldMinor||0))),<Status>{a.status||'UNKNOWN'}</Status>])}/></Block></>}
function AdminTransfers({data}){return <><Heading eyebrow="TRANSACTION MONITORING" title="Transfers" subtitle="Bank transfer records are viewed without changing their status."/><Block title="Recent transactions"><Table headings={['Reference','Source','Destination','Amount','Status']} rows={data.transfers.map(t=>[t.transferId||t.id,t.fromAccountId||'—',t.destinationIfsc||t.toAccountId||'—',rupees(t.amountMinor),<Status>{t.status||'UNKNOWN'}</Status>])}/></Block></>}
function AdminLoans({data,token,run}){return <><Heading eyebrow="LENDING OPERATIONS" title="Loan requests" subtitle="Review portal-created loan applications; approval does not disburse funds."/><Block title="Applications"><Table headings={['Customer','Type','Amount','Status','Action']} rows={data.loans.map(l=>[l.uid,l.type,rupees(l.amountMinor),<Status>{l.status}</Status>,l.portalCreated&&l.status==='PENDING'?<div className="demo-inline-actions">{[['APPROVED','Approve'],['REJECTED','Reject']].map(([decision,label])=><button key={decision} onClick={()=>run(()=>portalApi(`/admin/loans/${l.id}/review`,{token,method:'POST',data:{decision}}),`Loan ${decision.toLowerCase()}`)}>{label}</button>)}</div>:'Read-only'])}/></Block></>}
function AdminAnnouncements({data,token,run}){const [title,setTitle]=useState(''),[body,setBody]=useState('');return <><Heading eyebrow="BANK COMMUNICATIONS" title="Announcements" subtitle="Publish messages visible to authenticated customers."/><div className="demo-two-cols align-start"><Block title="New announcement"><form className="demo-stack" onSubmit={e=>{e.preventDefault();run(()=>portalApi('/admin/announcements',{token,method:'POST',data:{title,body}}),'Announcement published').then(ok=>{if(ok){setTitle('');setBody('');}});}}><label>Title<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={80} required/></label><label>Message<textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={500} required/></label><button className="demo-primary-wide">Publish announcement <Send size={16}/></button></form></Block><Block title="Published announcements">{data.announcements.length?data.announcements.map(n=><div className="demo-notice" key={n.id}><span className="demo-notice-icon"><Bell size={18}/></span><div><strong>{n.title}</strong><p>{n.body}</p><small>{stamp(n.createdAt)}</small></div></div>):<Empty icon={Bell} title="No announcements yet"/>}</Block></div></>}
function AdminSettings(){return <><Heading eyebrow="BANK CONFIGURATION" title="Settings" subtitle="Read-only integration details; existing X42 limits and policies are not modified."/><Block title="Current integration"><div className="demo-summary-stats"><div><span>Bank ID</span><b>{bank.id}</b></div><div><span>IFSC</span><b>{bank.ifsc}</b></div><div><span>Original Worker</span><b>{worker?'Configured':'Missing'}</b></div><div><span>Portal API</span><b>{portalBase?'Configured':'Not configured'}</b></div></div><Alert>Bank-wide limits must be changed through the authorized X42 bank backend. This UI does not modify existing transfer limits.</Alert></Block></>}

export default function BankApp(){
  const [mode,setMode]=useState('customer');const [session,setSession]=useState(null);
  const [page,setPage]=useState('overview');const [data,setData]=useState(initial);
  const [user,setUser]=useState(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(false);
  const [extraError,setExtraError]=useState('');
  const load=useCallback(async (s,quiet=false)=>{
    if(!s)return;
    if(!quiet)setLoading(true);
    try {
      if(s.role==='admin'){
        const [profile,snapshot]=await Promise.all([portalApi('/me',{token:s.portalToken}),portalApi('/admin/snapshot',{token:s.portalToken})]);
        setUser(profile);
        setData({...initial,...snapshot,accounts:normalize(snapshot.accounts).map(normAccount),transfers:normalize(snapshot.transfers).map(normTransfer)});
      } else {
        let workerData={accounts:[],transfers:[]}, directory=[];
        let workerError='';
        if(s.workerToken) {
          try {
            const [dash,dir]=await Promise.all([liveApi(worker,prefix+'/dashboard',{token:s.workerToken}),liveApi(worker,'/directory/banks')]);
            workerData=dash; directory=dir.banks||[];
          } catch(e){workerError=e.message;}
        }
        let profile=null, beneficiaries=[],loans=[],announcements=[];
        let extensionError='';
        if(s.portalToken) {
          const calls=await Promise.allSettled([
            portalApi('/me',{token:s.portalToken}), portalApi('/customer/beneficiaries',{token:s.portalToken}),
            portalApi('/customer/loans',{token:s.portalToken}),portalApi('/announcements',{token:s.portalToken}),
          ]);
          profile=calls[0].status==='fulfilled'?calls[0].value:null;
          beneficiaries=calls[1].status==='fulfilled'?calls[1].value.items:[];
          loans=calls[2].status==='fulfilled'?calls[2].value.items:[];
          announcements=calls[3].status==='fulfilled'?calls[3].value.items:[];
          if(calls.some(r=>r.status==='rejected')) extensionError='Some additional bank services are temporarily unavailable.';
        } else extensionError='Additional services require the separate portal API.';
        setExtraError([workerError,extensionError].filter(Boolean).join(' '));
        const accounts=normalize(workerData.accounts).map(normAccount);
        const current=profile||{uid:s.uid,email:s.email,role:'customer',name:s.email?.split('@')[0],status:accounts[0]?.status||'UNKNOWN'};
        setUser({...current,name:current.name||current.email?.split('@')[0]||'Customer',status:current.status==='UNKNOWN'&&accounts[0]?accounts[0].status:current.status});
        setData({...initial,accounts,transfers:normalize(workerData.transfers).map(normTransfer),directory,beneficiaries:normalize(beneficiaries),loans:normalize(loans),announcements:normalize(announcements)});
      }
      setError('');
    } catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[]);
  async function login(email,password,role){setBusy(true);setError('');setNotice('');try{
    let portalSession=null,workerSession=null,workerError=null;
    if(portalBase){try{portalSession=await portalApi('/auth/login',{method:'POST',data:{email:email.trim(),password}});}catch(e){if(role==='admin')throw e;workerError=e;}}
    if(role==='admin'){
      if(!portalSession)throw new Error('Administrator access requires the deployed portal API.');
      if(portalSession.role!=='admin')throw new Error('This Firebase account is not authorized as an administrator.');
    } else {
      if(portalSession?.role==='admin')throw new Error('Use the administrator portal with this account.');
      try{workerSession=await liveApi(worker,prefix+'/sign-in',{data:{email:email.trim(),password}});}catch(e){workerError=e;}
      if(!workerSession&&!portalSession)throw workerError||new Error('Unable to authenticate.');
    }
    const newSession={uid:portalSession?.uid||workerSession?.uid,email:portalSession?.email||workerSession?.email||email,role,
      portalToken:portalSession?.token||null,workerToken:workerSession?.token||null};
    setSession(newSession);setPage('overview');await load(newSession);
  }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function register(form,onSuccess){setBusy(true);setError('');setNotice('');try{
    if(form.password!==form.confirm)throw new Error('Passwords do not match.');
    await portalApi('/auth/register',{method:'POST',data:{email:form.email,name:form.name,password:form.password,phone:form.phone,documentType:form.documentType,documentRefLast4:form.documentRefLast4}});
    setNotice('Registration submitted. Sign in after your administrator reviews the account.');onSuccess();
  }catch(e){setError(e.message);}finally{setBusy(false);}}
  function logout(){setSession(null);setUser(null);setData(initial);setPage('overview');setError('');setNotice('');setExtraError('');}
  async function run(operation,message){setBusy(true);setError('');try{await operation();setNotice(message);await load(session,true);return true;}catch(e){setError(e.message);return false;}finally{setBusy(false);}}
  async function send(details){setBusy(true);setError('');try{
    if(!session?.workerToken)throw new Error('Transfers require a valid session with the original Worker.');
    const raw=JSON.stringify([bank.id,worker,session.uid,details]);
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)));
    const hash=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    const keyName='x42-pending-'+hash;
    const idempotencyKey=readStorage(sessionStorage,keyName,null)||crypto.randomUUID();
    saveStorage(sessionStorage,keyName,idempotencyKey);
    const result=await liveApi(worker,prefix+'/transfers',{token:session.workerToken,data:details,key:idempotencyKey});
    saveStorage(sessionStorage,keyName,null);
    setNotice(`${result.status||'Accepted'} · ${result.transferId||'Transaction submitted'}`);
    await load(session,true);
  }catch(e){setError(e.message);throw e;}finally{setBusy(false);}}
  const pending=useMemo(()=>data.kyc.filter(k=>['PENDING','HOLD'].includes(k.status)).length,[data.kyc]);
  if(!session||!user)return <><Auth mode={mode} setMode={setMode} onLogin={login} onRegister={register} error={error} busy={busy}/>{notice&&<div className="demo-register-success" role="status">{notice}</div>}</>;
  let content;
  if(session.role==='admin')switch(page){
    case 'customers':content=<AdminCustomers data={data}/>;break;
    case 'kyc':content=<AdminKyc data={data} token={session.portalToken} run={run}/>;break;
    case 'accounts':content=<AdminAccounts data={data}/>;break;
    case 'transfers':content=<AdminTransfers data={data}/>;break;
    case 'loans':content=<AdminLoans data={data} token={session.portalToken} run={run}/>;break;
    case 'announcements':content=<AdminAnnouncements data={data} token={session.portalToken} run={run}/>;break;
    case 'settings':content=<AdminSettings/>;break;
    default:content=<AdminHome data={data} setPage={setPage}/>;
  }else switch(page){
    case 'accounts':content=<CustomerAccounts user={user} data={data}/>;break;
    case 'transfer':content=<CustomerTransfer data={data} onSend={send} loading={busy} workerAvailable={Boolean(session.workerToken)}/>;break;
    case 'beneficiaries':content=<CustomerBeneficiaries data={data} token={session.portalToken} run={run}/>;break;
    case 'transactions':content=<CustomerTransactions data={data}/>;break;
    case 'loans':content=<CustomerLoans data={data} token={session.portalToken} run={run}/>;break;
    case 'profile':content=<CustomerProfile user={user} token={session.portalToken} run={run}/>;break;
    default:content=<CustomerHome user={user} data={data} setPage={setPage}/>;
  }
  return <Shell user={user} role={session.role} page={page} setPage={setPage} onLogout={logout} onRefresh={()=>load(session)} requests={pending}>
    {notice&&<div className="demo-alert success" role="status"><CheckCircle2 size={18}/>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={16}/></button></div>}
    {error&&<Alert kind="error">{error}</Alert>}
    {extraError&&<Alert>{extraError}</Alert>}
    {loading&&<Alert>Loading bank data…</Alert>}{content}
  </Shell>;
}
