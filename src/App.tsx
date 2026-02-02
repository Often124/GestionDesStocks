import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import {
    TrendingUp,
    Package,
    AlertTriangle,
    ShoppingCart,
    Search,
    Plus,
    Trash2,
    Scan,
    Users,
    CheckCircle2,
    Clock,
    ArrowRight
} from 'lucide-react'
import { Html5QrcodeScanner } from 'html5-qrcode'

interface Item {
    id: string;
    title: string;
    ean: string;
    quantity: number;
    sold_quantity: number;
    last_sold_reset: string;
    category: string;
    purchase_price: number;
    sale_price: number;
}

interface Customer {
    id: string;
    first_name: string;
    last_name: string;
    facebook_pseudo: string;
}

interface Order {
    id: string;
    customer_id: string;
    status: 'attente' | 'payé';
    total_price: number;
    created_at: string;
    customers?: Customer;
    order_items?: OrderItem[];
}

interface OrderItem {
    id: string;
    order_id: string;
    item_id: string;
    quantity: number;
    unit_price: number;
    items?: Item;
}

const CATEGORIES_WITH_EMOJIS = [
    { name: 'Général', emoji: '📦' },
    { name: 'Vêtement', emoji: '👗' },
    { name: 'Beauté', emoji: '💄' },
    { name: 'Sac', emoji: '👜' },
    { name: 'Accessoires', emoji: '🎀' },
    { name: 'Bougie', emoji: '🕯️' },
    { name: 'Parfum', emoji: '✨' },
    { name: 'Parfum d\'ambiance', emoji: '🏠' },
    { name: 'Bain Douche', emoji: '🧴' }
];

function App() {
    const [activeTab, setActiveTab] = useState<'inventory' | 'customers' | 'orders'>('inventory');
    const [items, setItems] = useState<Item[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('Tous');
    const [newItem, setNewItem] = useState({
        title: '', ean: '', category: 'Général', purchase_price: '', sale_price: ''
    });
    const [newCustomer, setNewCustomer] = useState({ first_name: '', last_name: '', facebook_pseudo: '' });

    const [loading, setLoading] = useState(true);
    const [scannerConfig, setScannerConfig] = useState<{ active: boolean, target: 'new' | 'search' }>({ active: false, target: 'new' });

    useEffect(() => {
        fetchData();
        const channel = supabase.channel('global-v3').on('postgres_changes', { event: '*', schema: 'public' }, () => fetchData()).subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const [itemsRes, customersRes, ordersRes] = await Promise.all([
            supabase.from('items').select('*').order('created_at', { ascending: false }),
            supabase.from('customers').select('*').order('last_name', { ascending: true }),
            supabase.from('orders').select('*, customers(*), order_items(*, items(*))').order('created_at', { ascending: false })
        ]);

        if (itemsRes.data) {
            const today = new Date().toISOString().split('T')[0];
            const processedItems = itemsRes.data.map((item: Item) => {
                if (item.last_sold_reset !== today) {
                    return { ...item, sold_quantity: 0, last_sold_reset: today };
                }
                return item;
            });
            setItems(processedItems);
        }
        if (customersRes.data) setCustomers(customersRes.data);
        if (ordersRes.data) setOrders(ordersRes.data as Order[]);
        setLoading(false);
    };

    // Logique du scanner
    useEffect(() => {
        let scanner: Html5QrcodeScanner | null = null;
        if (scannerConfig.active) {
            scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
            scanner.render((decodedText) => {
                if (scannerConfig.target === 'new') setNewItem(prev => ({ ...prev, ean: decodedText }));
                else setSearch(decodedText);
                setScannerConfig({ active: false, target: 'new' });
                if (scanner) scanner.clear();
            }, (err) => console.warn(err));
        }
        return () => { if (scanner) scanner.clear().catch(() => { }); };
    }, [scannerConfig]);

    const applyMultiplier = (multiplier: number) => {
        const purchase = parseFloat(newItem.purchase_price);
        if (!isNaN(purchase)) {
            const priceWithTVA = purchase * 1.20;
            setNewItem(prev => ({
                ...prev,
                sale_price: (priceWithTVA * multiplier).toFixed(2)
            }));
        }
    };

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!/^[A-Za-zÀ-ÿ\s]+$/.test(newItem.title)) return alert("Lettres uniquement");
        if (!/^\d{13}$/.test(newItem.ean)) return alert("EAN 13 chiffres");

        const catObj = CATEGORIES_WITH_EMOJIS.find(c => c.name === newItem.category) || CATEGORIES_WITH_EMOJIS[0];
        const { error } = await supabase.from('items').insert([{
            ...newItem,
            title: newItem.title.trim(),
            category: `${catObj.emoji} ${catObj.name}`,
            purchase_price: parseFloat(newItem.purchase_price) || 0,
            sale_price: parseFloat(newItem.sale_price) || 0,
            quantity: 0,
            sold_quantity: 0,
            last_sold_reset: new Date().toISOString().split('T')[0]
        }]);
        if (!error) setNewItem({ title: '', ean: '', category: 'Général', purchase_price: '', sale_price: '' });
    };

    const updateQuantity = async (id: string, field: 'quantity' | 'sold_quantity', delta: number) => {
        const item = items.find(i => i.id === id);
        if (!item) return;
        const updates: any = {};
        updates[field] = Math.max(0, (item[field] || 0) + delta);
        await supabase.from('items').update(updates).eq('id', id);
    };

    const deleteItem = async (id: string) => {
        if (confirm("Supprimer cet article ?")) await supabase.from('items').delete().eq('id', id);
    };

    const handleAddCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.from('customers').insert([newCustomer]);
        if (!error) setNewCustomer({ first_name: '', last_name: '', facebook_pseudo: '' });
    };

    const createOrder = async (customerId: string) => {
        const { data: order, error } = await supabase.from('orders').insert([{ customer_id: customerId, status: 'attente', total_price: 0 }]).select().single();
        if (error) alert(error.message);
        else setActiveTab('orders');
    };

    const addItemToOrder = async (orderId: string, item: Item) => {
        const { error } = await supabase.from('order_items').insert([{
            order_id: orderId,
            item_id: item.id,
            quantity: 1,
            unit_price: item.sale_price
        }]);
        if (error) alert(error.message);
        else {
            const order = orders.find(o => o.id === orderId);
            if (order) await supabase.from('orders').update({ total_price: (order.total_price || 0) + item.sale_price }).eq('id', orderId);
        }
    };

    const updateOrderStatus = async (order: Order, newStatus: 'attente' | 'payé') => {
        if (newStatus === 'payé' && order.status !== 'payé') {
            for (const orderItem of (order.order_items || [])) {
                const item = items.find(i => i.id === orderItem.item_id);
                if (item) {
                    await supabase.from('items').update({
                        quantity: Math.max(0, item.quantity - orderItem.quantity),
                        sold_quantity: (item.sold_quantity || 0) + orderItem.quantity
                    }).eq('id', item.id);
                }
            }
        }
        await supabase.from('orders').update({ status: newStatus }).eq('id', order.id);
    };

    const deleteOrder = async (id: string) => {
        if (confirm("Supprimer ce panier ?")) await supabase.from('orders').delete().eq('id', id);
    };

    const filteredItems = items.filter(item =>
        (item.title?.toLowerCase().includes(search.toLowerCase()) || item.ean?.includes(search)) &&
        (categoryFilter === 'Tous' || item.category.includes(categoryFilter))
    );

    return (
        <div className="container">
            {scannerConfig.active && (
                <div className="scanner-container">
                    <div className="glass-card" style={{ width: '90%', maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '1rem', color: 'white' }}>{scannerConfig.target === 'search' ? 'Scan Recherche' : 'Scan EAN'}</h2>
                        <div id="reader"></div>
                        <button className="scanner-btn" onClick={() => setScannerConfig({ active: false, target: 'new' })}>Fermer</button>
                    </div>
                </div>
            )}

            <header>
                <div className="logo-container"><img src="/logo.jpg" alt="Logo" className="site-logo" /></div>
                <h1>Lovely Shopping</h1>
                <p className="subtitle">Luxe & Élégance au Quotidien</p>
            </header>

            <nav className="view-tabs">
                <button className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}><Package size={18} /> Stocks</button>
                <button className={`tab-btn ${activeTab === 'customers' ? 'active' : ''}`} onClick={() => setActiveTab('customers')}><Users size={18} /> Clients</button>
                <button className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}><ShoppingCart size={18} /> Commandes</button>
            </nav>

            {activeTab === 'inventory' && (
                <>
                    <section className="stats-dashboard">
                        <div className="glass-card stat-card">
                            <TrendingUp size={20} color="#fb6f92" />
                            <div className="stat-value">{items.reduce((a, i) => a + (i.sold_quantity * i.sale_price), 0).toFixed(2)} €</div>
                            <div className="stat-label">Ventes du Jour</div>
                        </div>
                        <div className="glass-card stat-card">
                            <AlertTriangle size={20} color="#d90429" />
                            <div className="stat-value" style={{ color: '#d90429' }}>{items.filter(i => i.quantity <= 1).length}</div>
                            <div className="stat-label">Alerte Stocks Critiques</div>
                        </div>
                    </section>

                    <div className="grid">
                        <aside>
                            <div className="glass-card">
                                <h2 style={{ marginBottom: '1.5rem' }}><Plus size={20} /> Nouvel Article</h2>
                                <form onSubmit={handleAddItem}>
                                    <div className="form-group"><label>Intitulé</label><input type="text" value={newItem.title} onChange={e => setNewItem({ ...newItem, title: e.target.value })} required /></div>
                                    <div className="form-group"><label style={{ display: 'flex', justifyContent: 'space-between' }}>EAN <Scan size={16} style={{ cursor: 'pointer' }} onClick={() => setScannerConfig({ active: true, target: 'new' })} /></label><input type="text" value={newItem.ean} onChange={e => setNewItem({ ...newItem, ean: e.target.value })} maxLength={13} required /></div>
                                    <div className="form-group"><label>Catégorie</label>
                                        <select className="glass-card" style={{ width: '100%', padding: '0.8rem' }} value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })}>
                                            {CATEGORIES_WITH_EMOJIS.map(c => <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group"><label>Prix Achat (€)</label><input type="number" step="0.01" value={newItem.purchase_price} onChange={e => setNewItem({ ...newItem, purchase_price: e.target.value })} /></div>
                                    <div className="multiplier-grid">
                                        {[2, 2.5, 3, 3.5, 4, 4.5].map(m => <button key={m} type="button" className="multiplier-btn" onClick={() => applyMultiplier(m)}>x{m}</button>)}
                                    </div>
                                    <div className="form-group" style={{ marginTop: '1rem' }}><label>Prix Vente (TVA incl.)</label><input type="number" step="0.01" value={newItem.sale_price} onChange={e => setNewItem({ ...newItem, sale_price: e.target.value })} /></div>
                                    <button type="submit">Enregistrer</button>
                                </form>
                            </div>
                        </aside>
                        <main>
                            <div className="search-container" style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} size={18} />
                                    <input type="text" className="glass-card" style={{ paddingLeft: '2.8rem', paddingRight: '2.8rem' }} placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
                                    <Scan style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }} size={18} onClick={() => setScannerConfig({ active: true, target: 'search' })} />
                                </div>
                                <select className="glass-card" style={{ width: '150px' }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                                    <option value="Tous">📦 Tous</option>
                                    {CATEGORIES_WITH_EMOJIS.map(c => <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}
                                </select>
                            </div>
                            <div className="item-list">
                                {filteredItems.map(item => (
                                    <div key={item.id} className={`glass-card item-card ${item.quantity <= 1 ? 'stock-alert' : ''}`} style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
                                        <div className="item-info">
                                            <div className="item-title">{item.title}</div>
                                            <div className="item-ean" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{item.ean} | {item.category}</div>
                                            <div className="price-tag" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{item.sale_price.toFixed(2)} €</div>
                                        </div>
                                        <div className="item-stats" style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                                            <div className="stat-group"><span className="stat-label">Stock</span>
                                                <div className="qty-controls">
                                                    <button className="qty-btn" onClick={() => updateQuantity(item.id, 'quantity', -1)}>-</button>
                                                    <span className="qty-badge">{item.quantity}</span>
                                                    <button className="qty-btn" onClick={() => updateQuantity(item.id, 'quantity', 1)}>+</button>
                                                </div>
                                            </div>
                                            <button className="tab-btn" style={{ padding: '0.4rem' }} onClick={() => {
                                                const order = orders.find(o => o.status === 'attente');
                                                if (order) addItemToOrder(order.id, item);
                                                else alert("Veuillez d'abord créer ou sélectionner un panier client.");
                                            }} title="Ajouter au panier"><ShoppingCart size={16} /></button>
                                            <button className="delete-btn" onClick={() => deleteItem(item.id)}><Trash2 size={18} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </main>
                    </div>
                </>
            )}

            {activeTab === 'customers' && (
                <section className="customers-view">
                    <div className="glass-card" style={{ marginBottom: '2rem' }}>
                        <h2><Plus size={20} /> Nouveau Client</h2>
                        <form onSubmit={handleAddCustomer} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '1rem', marginTop: '1rem' }}>
                            <input type="text" placeholder="Prénom" value={newCustomer.first_name} onChange={e => setNewCustomer({ ...newCustomer, first_name: e.target.value })} required className="glass-card" style={{ padding: '0.8rem' }} />
                            <input type="text" placeholder="Nom" value={newCustomer.last_name} onChange={e => setNewCustomer({ ...newCustomer, last_name: e.target.value })} required className="glass-card" style={{ padding: '0.8rem' }} />
                            <input type="text" placeholder="Pseudo Facebook" value={newCustomer.facebook_pseudo} onChange={e => setNewCustomer({ ...newCustomer, facebook_pseudo: e.target.value })} className="glass-card" style={{ padding: '0.8rem' }} />
                            <button type="submit" style={{ padding: '0.8rem 2rem' }}>Enregistrer</button>
                        </form>
                    </div>
                    <div className="customer-grid">
                        {customers.map(c => (
                            <div key={c.id} className="glass-card customer-card">
                                <h3 style={{ margin: 0 }}>{c.first_name} {c.last_name}</h3>
                                <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>FB: {c.facebook_pseudo || '-'}</p>
                                <button className="tab-btn active" style={{ width: '100%', marginTop: '1rem' }} onClick={() => createOrder(c.id)}>Panier <ArrowRight size={16} /></button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {activeTab === 'orders' && (
                <section className="orders-view">
                    <div className="orders-grid">
                        {orders.map(order => (
                            <div key={order.id} className="glass-card order-card" style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                    <div>
                                        <h3 style={{ margin: 0 }}>{order.customers?.first_name} {order.customers?.last_name}</h3>
                                        <span className={`status-badge status-${order.status}`}>{order.status}</span>
                                    </div>
                                    <button className="delete-btn" onClick={() => deleteOrder(order.id)}><Trash2 size={16} /></button>
                                </div>
                                <div className="basket-items" style={{ minHeight: '60px', borderTop: '1px solid var(--card-border)', paddingTop: '1rem' }}>
                                    {order.order_items?.map((oi: any) => (
                                        <div key={oi.id} className="basket-item">
                                            <span>{oi.items?.title} (x{oi.quantity})</span>
                                            <span>{oi.unit_price.toFixed(2)} €</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="total-tag">Total: {order.total_price.toFixed(2)} €</div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                                    <button disabled={order.status === 'attente'} className="tab-btn" onClick={() => updateOrderStatus(order, 'attente')}><Clock size={16} /> Attente</button>
                                    <button disabled={order.status === 'payé'} className="tab-btn active" onClick={() => updateOrderStatus(order, 'payé')} style={{ background: '#38b000' }}><CheckCircle2 size={16} /> Payé</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

export default App
