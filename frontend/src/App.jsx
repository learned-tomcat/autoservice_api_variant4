import React from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const CATEGORIES = ['Диагностика', 'Ремонт', 'Техническое обслуживание', 'Шиномонтаж'];
const EMPTY_CLIENT = { full_name: '', phone: '', vehicle_brand: '', vehicle_model: '', license_plate: '' };
const fmt = (value) => new Intl.NumberFormat('ru-RU').format(value ?? 0);
const today = () => new Date().toLocaleDateString('en-CA');

function getErrorMessage(payload, status) {
  if (typeof payload?.detail === 'string') return payload.detail;
  if (Array.isArray(payload?.detail)) {
    return payload.detail.map((issue) => `${issue.loc?.at(-1) || 'Поле'}: ${issue.msg}`).join('; ');
  }
  return `Сервер вернул ошибку ${status}`;
}
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch (_) {
    throw new Error('Нет соединения с API. Проверьте, что FastAPI запущен на порту 8000.');
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getErrorMessage(payload, response.status));
  return payload;
}
const queryString = (params) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => { if (val !== '' && val != null) query.set(key, String(val)); });
  return query.toString() ? `?${query}` : '';
};
const API = {
  clients: (p) => request(`/clients${queryString(p)}`),
  client: (id) => request(`/clients/${id}`),
  addClient: (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id, data) => request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClient: (id) => request(`/clients/${id}`, { method: 'DELETE' }),
  services: (p) => request(`/services${queryString(p)}`),
  addService: (data) => request('/services', { method: 'POST', body: JSON.stringify(data) }),
  addMaintenance: (data) => request('/maintenance', { method: 'POST', body: JSON.stringify(data) }),
  history: (id) => request(`/clients/${id}/history`),
};

function Icon({ name, size = 20 }) {
  const base = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const icons = {
    car: <><path d="M5 17H3v-5l2-6h14l2 6v5h-2"/><path d="M5 17h14M5 12h14"/><circle cx="7" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 6a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/></>,
    search: <><circle cx="10.7" cy="10.7" r="6.7"/><path d="m16 16 5 5"/></>,
    wrench: <><path d="M14.6 6.1a5 5 0 0 0-6.7 6.7L3 17.7 6.3 21l4.9-4.9a5 5 0 0 0 6.7-6.7L14 13l-3-3 3.6-3.9Z"/></>,
    clipboard: <><rect x="5" y="5" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="M9 12h6M9 16h6"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    back: <path d="m15 18-6-6 6-6"/>,
    edit: <><path d="m15 5 4 4-10 10H5v-4L15 5Z"/><path d="m13 7 4 4"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="M10 11v6M14 11v6"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14-5L3 9M3 4v5h5M4 13a8 8 0 0 0 14 5l3-3M21 20v-5h-5"/></>,
    check: <path d="m4 12 5 5L20 6"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    alert: <><circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 17h.01"/></>,
  };
  return <svg {...base}>{icons[name] || icons.car}</svg>;
}
function Empty({ title, detail, icon = 'users' }) { return <div className="empty"><div className="empty-icon"><Icon name={icon} size={30}/></div><strong>{title}</strong><p>{detail}</p></div>; }
function ErrorBox({ message }) { return message ? <div className="error" role="alert"><Icon name="alert" size={18}/><span>{message}</span></div> : null; }
function Field({ label, required = false, children }) { return <label className="field"><span>{label}{required && <em> *</em>}</span>{children}</label>; }
const textInput = (props) => <input className="control" {...props} />;

export default function App() {
  const [screen, setScreen] = React.useState('clients');
  const [toast, setToast] = React.useState('');
  const [formClientId, setFormClientId] = React.useState(null);
  const [historyClientId, setHistoryClientId] = React.useState(null);
  const [refresh, setRefresh] = React.useState(0);
  const [clients, setClients] = React.useState({ items: [], total: 0, pages: 0 });
  const [clientsBusy, setClientsBusy] = React.useState(true);
  const [clientsError, setClientsError] = React.useState('');
  const [clientFilters, setClientFilters] = React.useState({ search: '', sort_by: 'full_name', direction: 'asc', page: 1, page_size: 6 });
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [services, setServices] = React.useState({ items: [], total: 0, pages: 0 });
  const [servicesBusy, setServicesBusy] = React.useState(false);
  const [servicesError, setServicesError] = React.useState('');
  const [serviceFilters, setServiceFilters] = React.useState({ category: '', min_price: '', max_price: '', sort_by: 'name', direction: 'asc', page: 1, page_size: 8 });
  const [history, setHistory] = React.useState(null);
  const [historyBusy, setHistoryBusy] = React.useState(false);
  const [historyError, setHistoryError] = React.useState('');
  const [allServices, setAllServices] = React.useState([]);

  React.useEffect(() => { const id = setTimeout(() => setDebouncedSearch(clientFilters.search.trim()), 300); return () => clearTimeout(id); }, [clientFilters.search]);
  React.useEffect(() => {
    if (screen !== 'clients') return;
    let active = true;
    setClientsBusy(true); setClientsError('');
    API.clients({ ...clientFilters, search: debouncedSearch }).then(data => { if (active) setClients(data); })
      .catch(err => { if (active) setClientsError(err.message); })
      .finally(() => { if (active) setClientsBusy(false); });
    return () => { active = false; };
  }, [screen, clientFilters.sort_by, clientFilters.direction, clientFilters.page, clientFilters.page_size, debouncedSearch, refresh]);
  React.useEffect(() => {
    if (screen !== 'services') return;
    let active = true;
    setServicesBusy(true); setServicesError('');
    API.services(serviceFilters).then(data => { if (active) setServices(data); })
      .catch(err => { if (active) setServicesError(err.message); })
      .finally(() => { if (active) setServicesBusy(false); });
    return () => { active = false; };
  }, [screen, serviceFilters, refresh]);
  React.useEffect(() => {
    if (screen !== 'history' || historyClientId == null) return;
    let active = true;
    setHistoryBusy(true); setHistoryError(''); setHistory(null);
    async function load() {
      try {
        const [data, first] = await Promise.all([API.history(historyClientId), API.services({page:1, page_size:100})]);
        const collected = [...first.items];
        for (let page = 2; page <= first.pages; page++) {
          const result = await API.services({page, page_size:100});
          collected.push(...result.items);
        }
        if (active) { setHistory(data); setAllServices(collected); }
      } catch (err) { if (active) setHistoryError(err.message); }
      finally { if (active) setHistoryBusy(false); }
    }
    load();
    return () => { active = false; };
  }, [screen, historyClientId, refresh]);
  function notify(message) { setToast(message); }
  function navigate(next) { setScreen(next); setToast(''); }
  function startAdd() { setFormClientId(null); navigate('form'); }
  function startEdit(id) { setFormClientId(id); navigate('form'); }
  function openHistory(id) { setHistoryClientId(id); navigate('history'); }
  function changeClientFilter(field, value) { setClientFilters(prev => ({...prev, [field]:value, page:1})); }
  function changeServiceFilter(field, value) { setServiceFilters(prev => ({...prev, [field]:value, page:1})); }
  async function removeClient(client) {
    if (!window.confirm(`Удалить клиента «${client.full_name}»?`)) return;
    try {
      await API.deleteClient(client.id);
      notify('Клиент удалён'); setRefresh(x => x + 1);
    } catch (err) { setClientsError(err.message); }
  }
  const headings = {
    clients: ['Клиенты', 'Управление клиентами и автомобилями'],
    form: [formClientId ? 'Редактирование клиента' : 'Новый клиент', 'Регистрация и обновление данных автовладельца'],
    services: ['Каталог услуг', 'Тарифы, категории и обслуживание автомобилей'],
    history: ['История обслуживания', 'Работы по автомобилю и затраты клиента'],
  };
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Icon name="car" size={26}/></div><div><b>AutoDesk</b><small>СИСТЕМА АВТОСЕРВИСА</small></div></div>
      <p className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</p>
      <nav aria-label="Основная навигация">
        <button className={`nav-item ${screen === 'clients' ? 'active' : ''}`} onClick={() => navigate('clients')}><Icon name="users"/>Клиенты</button>
        <button className={`nav-item ${screen === 'form' ? 'active' : ''}`} onClick={startAdd}><Icon name="plus"/>Добавить клиента</button>
        <button className={`nav-item ${screen === 'services' ? 'active' : ''}`} onClick={() => navigate('services')}><Icon name="wrench"/>Услуги</button>
        <button className={`nav-item ${screen === 'history' ? 'active' : ''}`} onClick={() => { if (historyClientId != null) navigate('history'); else navigate('clients'); }}><Icon name="clipboard"/>История работ</button>
      </nav>
      <div className="sidebar-bottom"><span className="online-dot"/>FastAPI + React<small>Лабораторная работа №2 · Вариант 4</small></div>
    </aside>
    <main className="main">
      <div className="topbar"><div className="crumb">Автосервис <Icon name="chevron" size={15}/> <strong>{headings[screen][0]}</strong></div><div className="topbar-right"><span className="status"><span className="online-dot"/> REST API</span><span className="avatar">AD</span></div></div>
      <div className="content">
        <div className="page-heading"><div><p className="eyebrow">ПАНЕЛЬ УПРАВЛЕНИЯ / ВАРИАНТ 4</p><h1>{headings[screen][0]}</h1><p className="subtitle">{headings[screen][1]}</p></div><button className="btn btn-outline" onClick={() => setRefresh(x => x + 1)}><Icon name="refresh" size={17}/> Обновить</button></div>
        {toast && <div className="success"><Icon name="check" size={18}/>{toast}<button onClick={() => setToast('')} aria-label="Закрыть сообщение">×</button></div>}
        {screen === 'clients' && <section>
          <div className="stat-grid">
            <div className="stat"><div className="stat-label">ЗАРЕГИСТРИРОВАНО КЛИЕНТОВ</div><div className="stat-number">{clientsError ? '—' : fmt(clients.total)}</div><span className="stat-helper">{clientFilters.search ? 'Результаты поиска' : 'По текущему списку'}</span><span className="stat-icon"><Icon name="users" size={24}/></span></div>
            <div className="stat"><div className="stat-label">РАБОТА С ДАННЫМИ</div><div className="stat-number stat-word">CRUD</div><span className="stat-helper">Создание, просмотр, правка, удаление</span><span className="stat-icon"><Icon name="clipboard" size={24}/></span></div>
            <div className="stat"><div className="stat-label">ХРАНЕНИЕ</div><div className="stat-number stat-word">SQLite</div><span className="stat-helper">Сохранение между запусками</span><span className="stat-icon"><Icon name="car" size={24}/></span></div>
          </div>
          <div className="panel"><div className="panel-head"><div><h2>Список клиентов</h2><p>Поиск по ФИО или номеру телефона</p></div><button className="btn btn-primary" onClick={startAdd}><Icon name="plus" size={18}/> Добавить клиента</button></div>
            <div className="toolbar"><div className="search-box"><Icon name="search" size={19}/><input aria-label="Поиск клиентов" placeholder="Поиск клиента или телефона..." value={clientFilters.search} onChange={e => changeClientFilter('search', e.target.value)}/></div><select className="control compact" value={clientFilters.sort_by} onChange={e => changeClientFilter('sort_by',e.target.value)} aria-label="Сортировка клиентов"><option value="full_name">По ФИО</option><option value="id">По ID</option></select><select className="control compact" value={clientFilters.direction} onChange={e => changeClientFilter('direction',e.target.value)} aria-label="Направление сортировки"><option value="asc">По возрастанию</option><option value="desc">По убыванию</option></select></div>
            <ErrorBox message={clientsError}/>
            <div className="table-scroll"><table><thead><tr><th>КЛИЕНТ</th><th>ТЕЛЕФОН</th><th>АВТОМОБИЛЬ</th><th>ГОСНОМЕР</th><th className="th-right">ДЕЙСТВИЯ</th></tr></thead><tbody>{clientsBusy ? <tr><td colSpan="5" className="loading-cell">Загрузка клиентов...</td></tr> : clients.items.map(client => <tr key={client.id}><td><div className="person"><span className="person-icon">{client.full_name.slice(0,1).toUpperCase()}</span><div><b>{client.full_name}</b><small>Клиент №{client.id}</small></div></div></td><td>{client.phone}</td><td>{client.vehicle_brand} {client.vehicle_model}</td><td><span className="plate">{client.license_plate}</span></td><td><div className="row-actions"><button title="История клиента" aria-label={`История ${client.full_name}`} onClick={() => openHistory(client.id)}><Icon name="clipboard" size={17}/></button><button title="Редактировать" aria-label={`Редактировать ${client.full_name}`} onClick={() => startEdit(client.id)}><Icon name="edit" size={17}/></button><button title="Удалить" aria-label={`Удалить ${client.full_name}`} className="danger" onClick={() => removeClient(client)}><Icon name="trash" size={17}/></button></div></td></tr>)}</tbody></table></div>
            {!clientsBusy && !clientsError && clients.items.length === 0 && <Empty title="Клиенты не найдены" detail="Измените поисковый запрос или добавьте первого клиента."/>}
            <Pager page={clientFilters.page} pages={clients.pages} total={clients.total} onChange={page => setClientFilters(f => ({...f,page}))}/>
          </div>
        </section>}
        {screen === 'form' && <ClientForm key={formClientId ?? 'new'} id={formClientId} onSaved={() => { setRefresh(x=>x+1); navigate('clients'); notify(formClientId ? 'Данные клиента обновлены' : 'Новый клиент добавлен'); }} onCancel={() => navigate('clients')}/>}
        {screen === 'services' && <section className="two-col"><div className="panel"><div className="panel-head"><div><h2>Справочник услуг</h2><p>Поиск по категории и диапазону цены</p></div><span className="count-pill">{services.total} услуг</span></div><div className="service-filter"><select className="control" aria-label="Категория услуг" value={serviceFilters.category} onChange={e => changeServiceFilter('category',e.target.value)}><option value="">Все категории</option>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select><div className="price-range"><input className="control" aria-label="Цена от" type="number" min="1" placeholder="Цена от, ₽" value={serviceFilters.min_price} onChange={e=>changeServiceFilter('min_price',e.target.value)}/><input className="control" aria-label="Цена до" type="number" min="1" placeholder="Цена до, ₽" value={serviceFilters.max_price} onChange={e=>changeServiceFilter('max_price',e.target.value)}/></div><select className="control" value={serviceFilters.sort_by} onChange={e=>changeServiceFilter('sort_by',e.target.value)}><option value="name">Сортировка по названию</option><option value="price_rub">Сортировка по стоимости</option></select></div><ErrorBox message={servicesError}/><div className="service-list">{servicesBusy ? <p className="hint">Загрузка...</p> : services.items.map(item => <div className="service-line" key={item.id}><span className="service-line-icon"><Icon name="wrench" size={18}/></span><div><b>{item.name}</b><small>{item.category}</small></div><strong>{fmt(item.price_rub)} ₽</strong></div>)}</div>{!servicesBusy && !servicesError && services.items.length === 0 && <Empty icon="wrench" title="Услуги не найдены" detail="Добавьте новую услугу или измените фильтр."/>}<Pager page={serviceFilters.page} pages={services.pages} total={services.total} onChange={page => setServiceFilters(f => ({...f,page}))}/></div><ServiceForm onSaved={() => { setServiceFilters(f=>({...f,category:'',min_price:'',max_price:'',page:1})); setRefresh(x=>x+1); notify('Услуга добавлена'); }}/></section>}
        {screen === 'history' && (historyClientId == null ? <Empty title="Выберите клиента" detail="Перейдите в список и откройте историю нужного клиента."/> : <section><button className="back-link" onClick={() => navigate('clients')}><Icon name="back" size={17}/> К списку клиентов</button><ErrorBox message={historyError}/>{historyBusy ? <p className="hint">Загрузка истории обслуживания...</p> : history && <><div className="history-overview"><div className="history-client"><span className="client-avatar">{history.client.full_name.slice(0,1)}</span><div><small>КАРТОЧКА КЛИЕНТА №{history.client.id}</small><h2>{history.client.full_name}</h2><p>{history.client.vehicle_brand} {history.client.vehicle_model} · {history.client.license_plate}</p><p>{history.client.phone}</p></div></div><div className="history-metric"><small>ВЫПОЛНЕНО РАБОТ</small><b>{history.records_count}</b></div><div className="history-metric"><small>ПОТРАЧЕНО НА СЕРВИС</small><b>{fmt(history.total_spent_rub)} ₽</b></div></div><div className="two-col"><div className="panel"><div className="panel-head"><div><h2>История обслуживания</h2><p>Все работы по автомобилю, новые сверху</p></div></div>{history.records.length === 0 ? <Empty icon="calendar" title="История пока пуста" detail="Добавьте первую выполненную работу в форме справа."/> : <div className="records">{history.records.map(item => <div className="record" key={item.id}><div className="record-head"><strong>{item.service_name}</strong><span>{fmt(item.actual_price_rub)} ₽</span></div><div className="record-meta"><span><Icon name="calendar" size={15}/> {new Date(`${item.service_date}T12:00:00`).toLocaleDateString('ru-RU')}</span><span>Пробег: {fmt(item.mileage_km)} км</span></div>{item.notes && <p>{item.notes}</p>}</div>)}</div>}</div><MaintenanceForm clientId={history.client.id} services={allServices} onSaved={() => { setRefresh(x=>x+1); notify('Обслуживание зарегистрировано'); }}/></div></>}</section>)}
      </div>
    </main>
  </div>;
}

function Pager({ page, pages, total, onChange }) { if (total === 0) return null; return <div className="pager"><span>Всего записей: {total}</span><div><button disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Предыдущая страница"><Icon name="back" size={17}/></button><span>Страница {page} из {pages}</span><button disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Следующая страница"><Icon name="chevron" size={17}/></button></div></div>; }
function ClientForm({ id, onSaved, onCancel }) {
  const [data, setData] = React.useState(EMPTY_CLIENT);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(Boolean(id));
  const [error, setError] = React.useState('');
  React.useEffect(() => { if (!id) return; let active=true; API.client(id).then(value=> { if (active) setData({ full_name:value.full_name, phone:value.phone, vehicle_brand:value.vehicle_brand, vehicle_model:value.vehicle_model, license_plate:value.license_plate }); }).catch(err=> { if (active) setError(err.message); }).finally(()=> { if (active) setLoading(false); }); return ()=> { active=false; }; },[id]);
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { if (id) await API.updateClient(id, data); else await API.addClient(data); onSaved(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  const set = (key,value) => setData(prev=>({...prev,[key]:value}));
  return <section><button className="back-link" onClick={onCancel}><Icon name="back" size={17}/> К списку клиентов</button><div className="panel form-panel"><div className="form-header"><span className="form-header-icon"><Icon name="car" size={26}/></span><div><h2>{id ? `Редактирование клиента №${id}` : 'Регистрация нового клиента'}</h2><p>Все поля обязательны. Данные будут сохранены в базе SQLite.</p></div></div><ErrorBox message={error}/>{loading ? <p className="hint">Загрузка информации о клиенте...</p> : <form onSubmit={submit}><div className="form-group-title">ЛИЧНЫЕ ДАННЫЕ</div><div className="form-grid"><Field label="ФИО клиента" required><input className="control" value={data.full_name} onChange={e=>set('full_name',e.target.value)} minLength="2" maxLength="100" required placeholder="Иванов Иван Иванович"/></Field><Field label="Телефон" required><input className="control" value={data.phone} onChange={e=>set('phone',e.target.value)} minLength="10" maxLength="20" required placeholder="+79991234567"/></Field></div><div className="form-group-title">АВТОМОБИЛЬ</div><div className="form-grid"><Field label="Марка" required><input className="control" value={data.vehicle_brand} onChange={e=>set('vehicle_brand',e.target.value)} required minLength="2" maxLength="50" placeholder="Toyota"/></Field><Field label="Модель" required><input className="control" value={data.vehicle_model} onChange={e=>set('vehicle_model',e.target.value)} required maxLength="50" placeholder="Camry"/></Field><Field label="Государственный номер" required><input className="control" value={data.license_plate} onChange={e=>set('license_plate',e.target.value)} required minLength="5" maxLength="15" placeholder="А123ВС77"/></Field></div><div className="form-actions"><button className="btn btn-outline" type="button" onClick={onCancel}>Отмена</button><button disabled={busy} className="btn btn-primary" type="submit"><Icon name="check" size={18}/>{busy ? 'Сохранение...' : 'Сохранить клиента'}</button></div></form>}</div></section>;
}
function ServiceForm({ onSaved }) {
  const [data, setData] = React.useState({name:'',category:CATEGORIES[0],price_rub:''});
  const [busy,setBusy] = React.useState(false); const [error,setError] = React.useState('');
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { await API.addService({...data,price_rub:Number(data.price_rub)}); setData({name:'',category:CATEGORIES[0],price_rub:''}); onSaved(); } catch(err) { setError(err.message); } finally { setBusy(false); } }
  return <div className="panel form-card"><div className="panel-head"><div><h2>Добавить услугу</h2><p>Создайте новую позицию в каталоге</p></div><span className="form-header-icon small"><Icon name="plus" size={18}/></span></div><ErrorBox message={error}/><form onSubmit={submit}><Field label="Название услуги" required><input className="control" placeholder="Замена масла" required minLength="2" maxLength="100" value={data.name} onChange={e=>setData(d=>({...d,name:e.target.value}))}/></Field><Field label="Категория" required><select className="control" value={data.category} onChange={e=>setData(d=>({...d,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></Field><Field label="Стоимость, ₽" required><input type="number" min="1" max="10000000" step="1" className="control" placeholder="2500" required value={data.price_rub} onChange={e=>setData(d=>({...d,price_rub:e.target.value}))}/></Field><button disabled={busy} type="submit" className="btn btn-primary full"><Icon name="plus" size={18}/>{busy ? 'Добавление...' : 'Добавить услугу'}</button></form></div>;
}
function MaintenanceForm({ clientId, services, onSaved }) {
  const [data,setData] = React.useState({service_id:'',service_date:today(),mileage_km:'',actual_price_rub:'',notes:''});
  const [busy,setBusy] = React.useState(false); const [error,setError] = React.useState('');
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { await API.addMaintenance({client_id:clientId,service_id:Number(data.service_id),service_date:data.service_date,mileage_km:Number(data.mileage_km),actual_price_rub:data.actual_price_rub === '' ? null : Number(data.actual_price_rub),notes:data.notes.trim()||null}); setData({service_id:'',service_date:today(),mileage_km:'',actual_price_rub:'',notes:''}); onSaved(); } catch(err) { setError(err.message); } finally { setBusy(false); } }
  return <div className="panel form-card"><div className="panel-head"><div><h2>Записать обслуживание</h2><p>Новая работа для выбранного клиента</p></div></div><ErrorBox message={error}/>{services.length===0 && <p className="hint">Сначала добавьте услугу в каталоге.</p>}<form onSubmit={submit}><Field label="Услуга" required><select className="control" required value={data.service_id} onChange={e=>setData(d=>({...d,service_id:e.target.value}))}><option value="">Выберите услугу</option>{services.map(s=><option value={s.id} key={s.id}>{s.name} · {fmt(s.price_rub)} ₽</option>)}</select></Field><div className="form-grid"><Field label="Дата" required><input className="control" type="date" required max={today()} value={data.service_date} onChange={e=>setData(d=>({...d,service_date:e.target.value}))}/></Field><Field label="Пробег, км" required><input className="control" type="number" min="0" max="2000000" step="1" required value={data.mileage_km} onChange={e=>setData(d=>({...d,mileage_km:e.target.value}))}/></Field></div><Field label="Фактическая стоимость, ₽"><input className="control" type="number" min="1" max="10000000" step="1" value={data.actual_price_rub} placeholder="Необязательно — тариф услуги" onChange={e=>setData(d=>({...d,actual_price_rub:e.target.value}))}/></Field><Field label="Комментарий"><textarea className="control textarea" maxLength="500" rows="3" placeholder="Например: замена фильтра" value={data.notes} onChange={e=>setData(d=>({...d,notes:e.target.value}))}/></Field><button className="btn btn-primary full" disabled={busy || services.length===0} type="submit"><Icon name="plus" size={18}/>{busy ? 'Сохранение...' : 'Зарегистрировать работу'}</button></form></div>;
}
