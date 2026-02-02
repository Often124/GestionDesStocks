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
    ArrowRight,
    X,
    MinusCircle,
    Archive,
    FileText,
    Download,
    Edit
} from 'lucide-react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
    const [activeTab, setActiveTab] = useState<'inventory' | 'customers' | 'orders' | 'archives'>('inventory');
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

    const [items, setItems] = useState<Item[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('Tous');
    const [newItem, setNewItem] = useState({
        title: '', ean: '', category: 'Général', purchase_price: '', sale_price: '', quantity: '0'
    });
    const [newCustomer, setNewCustomer] = useState({ first_name: '', last_name: '', facebook_pseudo: '' });
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

    const [loading, setLoading] = useState(true);
    const [scannerConfig, setScannerConfig] = useState<{ active: boolean, target: 'new' | 'search' }>({ active: false, target: 'new' });
    const [toast, setToast] = useState<{ message: string, visible: boolean }>({ message: '', visible: false });

    // Subscription globale pour le temps réel
    useEffect(() => {
        fetchData();
        const channels = [
            supabase.channel('public:items').on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => fetchData()).subscribe(),
            supabase.channel('public:customers').on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => fetchData()).subscribe(),
            supabase.channel('public:orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData()).subscribe(),
            supabase.channel('public:order_items').on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchData()).subscribe()
        ];
        return () => { channels.forEach(c => supabase.removeChannel(c)); };
    }, []);

    // Calcul automatique de la TVA (x1.20)
    useEffect(() => {
        const purchase = parseFloat(newItem.purchase_price);
        if (!isNaN(purchase) && purchase > 0) {
            setNewItem(prev => ({
                ...prev,
                sale_price: (purchase * 1.20).toFixed(2)
            }));
        } else if (newItem.purchase_price === '') {
            setNewItem(prev => ({ ...prev, sale_price: '' }));
        }
    }, [newItem.purchase_price]);

    const showToast = (message: string) => {
        setToast({ message, visible: true });
        setTimeout(() => setToast({ message: '', visible: false }), 3000);
    };

    const fetchData = async () => {
        setLoading(true);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 31);

        const [itemsRes, customersRes, ordersRes] = await Promise.all([
            supabase.from('items').select('*').order('created_at', { ascending: false }),
            supabase.from('customers').select('*').order('last_name', { ascending: true }),
            supabase.from('orders')
                .select('*, customers(*), order_items(*, items(*))')
                .gt('created_at', thirtyDaysAgo.toISOString())
                .order('created_at', { ascending: false })
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
        if (ordersRes.data) {
            const ordersData = (ordersRes.data as any[]).map(o => ({
                ...o,
                total_price: o.order_items?.reduce((acc: number, item: any) => acc + (item.unit_price * item.quantity), 0) || 0
            }));
            setOrders(ordersData as Order[]);
        }
        setLoading(false);
    };

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
        const catObj = CATEGORIES_WITH_EMOJIS.find(c => c.name === newItem.category) || CATEGORIES_WITH_EMOJIS[0];
        const { error } = await supabase.from('items').insert([{
            ...newItem,
            title: newItem.title.trim(),
            category: `${catObj.emoji} ${catObj.name}`,
            purchase_price: parseFloat(newItem.purchase_price) || 0,
            sale_price: parseFloat(newItem.sale_price) || 0,
            quantity: parseInt(newItem.quantity) || 0,
            sold_quantity: 0,
            last_sold_reset: new Date().toISOString().split('T')[0]
        }]);
        if (!error) {
            setNewItem({ title: '', ean: '', category: 'Général', purchase_price: '', sale_price: '', quantity: '0' });
            showToast("Article ajouté !");
            fetchData();
        }
    };

    const updateQuantity = async (id: string, field: 'quantity' | 'sold_quantity', delta: number) => {
        const item = items.find(i => i.id === id);
        if (!item) return;
        const updates: any = {};
        updates[field] = Math.max(0, (item[field] || 0) + delta);
        const { error } = await supabase.from('items').update(updates).eq('id', id);
        if (!error) fetchData();
    };

    const deleteItem = async (id: string) => {
        if (confirm("Supprimer cet article ?")) {
            const { error } = await supabase.from('items').delete().eq('id', id);
            if (!error) fetchData();
        }
    };

    const handleAddCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.from('customers').insert([newCustomer]);
        if (!error) {
            setNewCustomer({ first_name: '', last_name: '', facebook_pseudo: '' });
            showToast("Client enregistré !");
            fetchData();
        }
    };

    const handleUpdateCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingCustomer) return;
        const { error } = await supabase.from('customers').update({
            first_name: editingCustomer.first_name,
            last_name: editingCustomer.last_name,
            facebook_pseudo: editingCustomer.facebook_pseudo
        }).eq('id', editingCustomer.id);

        if (!error) {
            setEditingCustomer(null);
            showToast("Informations client mises à jour !");
            fetchData();
        } else {
            alert(error.message);
        }
    };

    const deleteCustomer = async (id: string) => {
        const hasOrders = orders.some(o => o.customer_id === id);
        if (hasOrders) {
            alert("Impossible de supprimer un client qui a des commandes. Supprimez ses commandes d'abord.");
            return;
        }

        if (confirm("Supprimer ce client ? Cette action est irréversible.")) {
            const { error } = await supabase.from('customers').delete().eq('id', id);
            if (!error) {
                showToast("Client supprimé.");
                fetchData();
            }
        }
    };

    const createOrder = async (customerId: string) => {
        const existingOrder = orders.find(o => o.customer_id === customerId && o.status === 'attente');
        if (existingOrder) {
            setActiveOrderId(existingOrder.id);
            setActiveTab('inventory');
            showToast("Reprise du panier en cours...");
            return;
        }

        const { data: order, error } = await supabase.from('orders').insert([{ customer_id: customerId, status: 'attente', total_price: 0 }]).select().single();
        if (error) alert(error.message);
        else {
            setActiveOrderId(order.id);
            setActiveTab('inventory');
            showToast("Panier ouvert ! 🛍️");
            fetchData();
        }
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
            showToast(`${item.title} ajouté ! ✅`);
            fetchData();
        }
    };

    const removeOrderItem = async (orderId: string, orderItemId: string) => {
        if (confirm("Retirer cet article du panier ?")) {
            const { error } = await supabase.from('order_items').delete().eq('id', orderItemId);
            if (!error) {
                showToast("Article retiré.");
                fetchData();
            }
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
            showToast("Commande payée ! Stock mis à jour. 👑");
        }
        const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', order.id);
        if (!error) fetchData();
    };

    const deleteOrder = async (id: string) => {
        if (confirm("Supprimer définitivement ce panier ?")) {
            const { error } = await supabase.from('orders').delete().eq('id', id);
            if (!error) {
                if (activeOrderId === id) setActiveOrderId(null);
                fetchData();
            }
        }
    };

    const generateInvoice = async (order: Order) => {
        const doc = new jsPDF();
        const customerName = `${order.customers?.first_name} ${order.customers?.last_name}`;
        const isPaid = order.status === 'payé';

        // Header - Image Logo
        try {
            const logoUrl = '/logo.jpg';
            const img = new Image();
            img.src = logoUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            doc.addImage(img, 'JPEG', 20, 10, 30, 30);
        } catch (e) {
            console.error("Logo non trouvé", e);
        }

        // Title & Brand
        doc.setFont("helvetica", "bold");
        doc.setFontSize(24);
        doc.setTextColor(251, 111, 146);
        doc.text("LOVELY SHOPPING", 55, 25);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.setFont("helvetica", "normal");
        doc.text(isPaid ? "FACTURE" : "FACTURE PROVISOIRE", 55, 32);

        doc.setDrawColor(251, 111, 146);
        doc.line(20, 45, 190, 45);

        // Details
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.text("DESTINATAIRE:", 20, 55);
        doc.setFont("helvetica", "normal");
        doc.text(customerName.toUpperCase(), 20, 62);
        if (order.customers?.facebook_pseudo) {
            doc.text(`FB: @${order.customers.facebook_pseudo}`, 20, 67);
        }

        doc.setFont("helvetica", "bold");
        doc.text("DÉTAILS COMMANDE:", 130, 55);
        doc.setFont("helvetica", "normal");
        doc.text(`Date: ${new Date(order.created_at).toLocaleDateString()}`, 130, 62);
        doc.text(`Référence: #${order.id.split('-')[0].toUpperCase()}`, 130, 67);

        // Table
        const tableData = (order.order_items || []).map(oi => [
            oi.items?.title || "Article inconnu",
            oi.quantity,
            `${oi.unit_price.toFixed(2)} €`,
            `${(oi.quantity * oi.unit_price).toFixed(2)} €`
        ]);

        autoTable(doc, {
            startY: 80,
            head: [['Désignation', 'Qté', 'Prix Unitaire', 'Total']],
            body: tableData,
            headStyles: { fillColor: [251, 111, 146], fontStyle: 'bold' },
            margin: { horizontal: 20 },
            theme: 'striped',
            styles: { font: 'helvetica', fontSize: 10 }
        });

        const finalY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(251, 111, 146);
        doc.text(`TOTAL: ${order.total_price.toFixed(2)} €`, 190, finalY, { align: 'right' });

        if (isPaid) {
            doc.setFontSize(12);
            doc.setTextColor(56, 176, 0);
            doc.text("RÈGLEMENT EFFECTUÉ", 190, finalY + 10, { align: 'right' });
        }

        // Footer
        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(150);
        doc.text("Merci pour votre confiance ! Lovely Shopping vous souhaite une agréable journée.", 105, 285, { align: 'center' });

        doc.save(`${isPaid ? 'Facture' : 'Facture_Provisoire'}_${customerName.replace(' ', '_')}.pdf`);
    };

    const filteredItems = items.filter(item =>
        (item.title?.toLowerCase().includes(search.toLowerCase()) || item.ean?.includes(search)) &&
        (categoryFilter === 'Tous' || item.category.includes(categoryFilter))
    );

    const activeCustomerName = activeOrderId
        ? orders.find(o => o.id === activeOrderId)?.customers?.first_name
        : null;

    return (
        <div className="container">
            {toast.visible && (
                <div className="glass-card" style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'var(--primary)', color: 'white', padding: '0.8rem 1.5rem', borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.2)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.8rem', animation: 'fadeInDown 0.3s ease-out' }}>
                    <CheckCircle2 size={18} />
                    {toast.message}
                </div>
            )}

            {scannerConfig.active && (
                <div className="scanner-container">
                    <div className="glass-card" style={{ width: '90%', maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '1rem', color: 'white' }}>Scanner</h2>
                        <div id="reader"></div>
                        <button className="scanner-btn" onClick={() => setScannerConfig({ active: false, target: 'new' })}>Fermer</button>
                    </div>
                </div>
            )}

            {/* Modal Edition Client */}
            {editingCustomer && (
                <div className="scanner-container" style={{ zIndex: 1100 }}>
                    <div className="glass-card" style={{ width: '90%', maxWidth: '400px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0 }}>Modifier Client</h2>
                            <button className="delete-btn" onClick={() => setEditingCustomer(null)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleUpdateCustomer}>
                            <div className="form-group"><label>Prénom</label><input type="text" value={editingCustomer.first_name} onChange={e => setEditingCustomer({ ...editingCustomer, first_name: e.target.value })} required /></div>
                            <div className="form-group"><label>Nom</label><input type="text" value={editingCustomer.last_name} onChange={e => setEditingCustomer({ ...editingCustomer, last_name: e.target.value })} required /></div>
                            <div className="form-group"><label>Pseudo Facebook</label><input type="text" value={editingCustomer.facebook_pseudo} onChange={e => setEditingCustomer({ ...editingCustomer, facebook_pseudo: e.target.value })} /></div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                <button type="button" className="tab-btn" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }} onClick={() => setEditingCustomer(null)}>Annuler</button>
                                <button type="submit" style={{ flex: 1 }}>Enregistrer</button>
                            </div>
                        </form>
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
                <button className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => { setActiveTab('orders'); setActiveOrderId(null); }}><ShoppingCart size={18} /> Panier</button>
                <button className={`tab-btn ${activeTab === 'archives' ? 'active' : ''}`} onClick={() => { setActiveTab('archives'); setActiveOrderId(null); }}><Archive size={18} /> Archives</button>
            </nav>

            {activeOrderId && activeTab === 'inventory' && (
                <div className="glass-card active-basket-banner">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                        <div className="pulse-icon"><ShoppingCart size={20} /></div>
                        <span style={{ fontWeight: 700 }}>Remplissage du panier de {activeCustomerName}...</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="tab-btn" style={{ background: 'white', color: 'var(--primary)', padding: '0.4rem 1rem' }} onClick={() => { setActiveTab('orders'); setActiveOrderId(null); }}>Valider Panier</button>
                        <button className="tab-btn" style={{ background: 'rgba(255,255,255,0.2)', border: 'none', padding: '0.4rem' }} onClick={() => setActiveOrderId(null)} title="Changer de client"><Plus style={{ transform: 'rotate(45deg)' }} size={18} /></button>
                    </div>
                </div>
            )}

            {activeTab === 'inventory' && (
                <>
                    <section className="stats-dashboard">
                        <div className="glass-card stat-card">
                            <TrendingUp size={20} color="#fb6f92" />
                            <div className="stat-value">{items.reduce((a, i) => a + (i.sold_quantity * i.sale_price), 0).toFixed(2)} €</div>
                            <div className="stat-label">Ventes (24h)</div>
                        </div>
                        <div className="glass-card stat-card">
                            <AlertTriangle size={20} color="#d90429" />
                            <div className="stat-value" style={{ color: '#d90429' }}>{items.filter(i => i.quantity <= 1).length}</div>
                            <div className="stat-label">Alertes Stock</div>
                        </div>
                    </section>

                    <div className="grid">
                        <aside>
                            <div className="glass-card">
                                <h2 style={{ marginBottom: '1.5rem' }}><Plus size={20} /> Ajouter Article</h2>
                                <form onSubmit={handleAddItem}>
                                    <div className="form-group"><label>Intitulé</label><input type="text" value={newItem.title} onChange={e => setNewItem({ ...newItem, title: e.target.value })} required /></div>
                                    <div className="form-group"><label style={{ display: 'flex', justifyContent: 'space-between' }}>EAN <Scan size={16} style={{ cursor: 'pointer' }} onClick={() => setScannerConfig({ active: true, target: 'new' })} /></label><input type="text" value={newItem.ean} onChange={e => setNewItem({ ...newItem, ean: e.target.value })} maxLength={13} required /></div>
                                    <div className="form-group"><label>Catégorie</label>
                                        <select className="glass-card" style={{ width: '100%', padding: '0.8rem' }} value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })}>
                                            {CATEGORIES_WITH_EMOJIS.map(c => <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group"><label>Stock Initial</label><input type="number" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: e.target.value })} placeholder="0" /></div>
                                    <div className="form-group"><label>Prix Achat (€)</label><input type="number" step="0.01" value={newItem.purchase_price} onChange={e => setNewItem({ ...newItem, purchase_price: e.target.value })} placeholder="0.00" /></div>
                                    <div className="multiplier-grid">
                                        {[2, 2.5, 3, 3.5, 4, 4.5].map(m => <button key={m} type="button" className="multiplier-btn" onClick={() => applyMultiplier(m)}>x{m}</button>)}
                                    </div>
                                    <div className="form-group" style={{ marginTop: '1rem' }}><label>Prix Vente (TVA incl.)</label><input type="number" step="0.01" value={newItem.sale_price} onChange={e => setNewItem({ ...newItem, sale_price: e.target.value })} /></div>
                                    <button type="submit">Enregistrer dans le Stock</button>
                                </form>
                            </div>
                        </aside>
                        <main>
                            <div className="search-container" style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} size={18} />
                                    <input type="text" className="glass-card" style={{ paddingLeft: '2.8rem', paddingRight: '2.8rem' }} placeholder="Rechercher par nom ou EAN..." value={search} onChange={e => setSearch(e.target.value)} />
                                    <Scan style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }} size={18} onClick={() => setScannerConfig({ active: true, target: 'search' })} />
                                </div>
                                <select className="glass-card" style={{ width: '150px' }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                                    <option value="Tous">📦 Tous</option>
                                    {CATEGORIES_WITH_EMOJIS.map(c => <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}
                                </select>
                            </div>
                            <div className="item-list">
                                {filteredItems.map(item => (
                                    <div key={item.id} className={`glass-card item-card ${item.quantity <= 1 ? 'stock-alert' : ''}`}>
                                        <div className="item-info">
                                            <div className="item-title">{item.title}</div>
                                            <div className="item-ean" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{item.ean} | {item.category}</div>
                                            <div className="price-tag">{item.sale_price.toFixed(2)} €</div>
                                        </div>
                                        <div className="item-stats">
                                            <div className="stat-group"><span className="stat-label">Stock</span>
                                                <div className="qty-controls">
                                                    <button className="qty-btn" onClick={() => updateQuantity(item.id, 'quantity', -1)}>-</button>
                                                    <span className="qty-badge">{item.quantity}</span>
                                                    <button className="qty-btn" onClick={() => updateQuantity(item.id, 'quantity', 1)}>+</button>
                                                </div>
                                            </div>
                                            <button
                                                className={`add-basket-refined ${activeOrderId ? 'highlight' : ''}`}
                                                onClick={() => {
                                                    if (activeOrderId) addItemToOrder(activeOrderId, item);
                                                    else {
                                                        const order = orders.find(o => o.status === 'attente');
                                                        if (order) {
                                                            setActiveOrderId(order.id);
                                                            addItemToOrder(order.id, item);
                                                        } else alert("Veuillez sélectionner un client d'abord !");
                                                    }
                                                }}
                                                title="Ajouter au Panier"
                                            >
                                                <ShoppingCart size={18} />
                                                {activeOrderId && <span className="add-badge">+1</span>}
                                            </button>
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
                        {customers.map(c => {
                            const activeOrder = orders.find(o => o.customer_id === c.id && o.status === 'attente');
                            return (
                                <div key={c.id} className="glass-card customer-card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <div>
                                            <h3 style={{ margin: 0 }}>{c.first_name} {c.last_name}</h3>
                                            <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>{c.facebook_pseudo ? `@${c.facebook_pseudo}` : 'Pas de pseudo'}</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button className="qty-btn" onClick={() => setEditingCustomer(c)} title="Modifier"><Edit size={16} /></button>
                                            <button className="delete-btn" onClick={() => deleteCustomer(c.id)} title="Supprimer"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                    {activeOrder ? (
                                        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                                            <span className="status-badge status-attente" style={{ flex: 1, textAlign: 'center' }}>Panier Ouvert</span>
                                            <button className="tab-btn active" style={{ flex: 2, justifyContent: 'center' }} onClick={() => createOrder(c.id)}>
                                                Reprendre <ArrowRight size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button className="tab-btn active" style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }} onClick={() => createOrder(c.id)}>
                                            Ouvrir un Panier <ArrowRight size={16} />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {activeTab === 'orders' && (
                <section className="orders-view">
                    <div className="orders-grid">
                        {orders.filter(o => o.status === 'attente').map(order => (
                            <div key={order.id} className={`glass-card order-card ${activeOrderId === order.id ? 'active-focus' : ''}`}>
                                <div className="order-header">
                                    <div>
                                        <h3 style={{ margin: 0 }}>{order.customers?.first_name} {order.customers?.last_name}</h3>
                                        <span className={`status-badge status-${order.status}`}>{order.status}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button className="qty-btn" onClick={() => generateInvoice(order)} title="Générer Facture Provisoire"><FileText size={16} /></button>
                                        <button className="delete-btn" onClick={() => deleteOrder(order.id)}><Trash2 size={16} /></button>
                                    </div>
                                </div>
                                <div className="basket-items-list">
                                    {order.order_items?.map((oi: any) => (
                                        <div key={oi.id} className="basket-item">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <button className="remove-item-btn" onClick={() => removeOrderItem(order.id, oi.id)} title="Retirer"><MinusCircle size={14} color="#d90429" /></button>
                                                <span>{oi.items?.title}</span>
                                            </div>
                                            <span style={{ fontWeight: 600 }}>{oi.unit_price.toFixed(2)} €</span>
                                        </div>
                                    ))}
                                    {(!order.order_items || order.order_items.length === 0) && <p style={{ opacity: 0.5, fontSize: '0.8rem', textAlign: 'center' }}>Le panier est vide</p>}
                                </div>
                                <div className="order-footer">
                                    <div className="total-tag">Total: {order.total_price.toFixed(2)} €</div>
                                    <div className="order-actions">
                                        <button className="tab-btn active pay-btn" onClick={() => updateOrderStatus(order, 'payé')}><CheckCircle2 size={16} /> Marquer Payé</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {orders.filter(o => o.status === 'attente').length === 0 && <div className="empty-state">Aucune commande en cours.</div>}
                    </div>
                </section>
            )}

            {activeTab === 'archives' && (
                <section className="orders-view">
                    <div className="orders-grid">
                        {orders.filter(o => o.status === 'payé').map(order => (
                            <div key={order.id} className="glass-card order-card archived-card">
                                <div className="order-header">
                                    <div>
                                        <h3 style={{ margin: 0 }}>{order.customers?.first_name} {order.customers?.last_name}</h3>
                                        <span className="status-badge status-payé">Payé</span>
                                    </div>
                                    <button className="qty-btn" onClick={() => generateInvoice(order)} title="Télécharger Facture Finale"><Download size={16} /></button>
                                </div>
                                <div className="basket-items-list">
                                    {order.order_items?.map((oi: any) => (
                                        <div key={oi.id} className="basket-item">
                                            <span>{oi.items?.title} (x{oi.quantity})</span>
                                            <span style={{ fontWeight: 600 }}>{oi.unit_price.toFixed(2)} €</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="order-footer">
                                    <div className="total-tag">Payé: {order.total_price.toFixed(2)} €</div>
                                    <div className="order-actions">
                                        <button className="tab-btn" onClick={() => updateOrderStatus(order, 'attente')}><Clock size={16} /> Remettre en cours</button>
                                        <button className="delete-btn" onClick={() => deleteOrder(order.id)} title="Supprimer Archive"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {orders.filter(o => o.status === 'payé').length === 0 && <div className="empty-state">Aucune archive pour le moment.</div>}
                    </div>
                </section>
            )}
        </div>
    )
}

export default App
