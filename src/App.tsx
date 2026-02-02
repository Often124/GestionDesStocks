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
    X,
    Filter
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

function App() {
    const [items, setItems] = useState<Item[]>([]);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('Tous');
    const [newItem, setNewItem] = useState({
        title: '',
        ean: '',
        quantity: '',
        sold_quantity: '0',
        category: 'Général',
        purchase_price: '',
        sale_price: ''
    });
    const [loading, setLoading] = useState(true);
    const [showScanner, setShowScanner] = useState(false);

    // Charger les articles au démarrage
    useEffect(() => {
        fetchItems();

        const channel = supabase
            .channel('items-v2-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'items' },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        setItems((prev) => [payload.new as Item, ...prev]);
                    } else if (payload.eventType === 'DELETE') {
                        setItems((prev) => prev.filter((item) => item.id !== payload.old.id));
                    } else if (payload.eventType === 'UPDATE') {
                        setItems((prev) =>
                            prev.map((item) => (item.id === payload.new.id ? (payload.new as Item) : item))
                        );
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Logique du scanner
    useEffect(() => {
        let scanner: Html5QrcodeScanner | null = null;
        if (showScanner) {
            scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
            scanner.render((decodedText) => {
                setNewItem(prev => ({ ...prev, ean: decodedText }));
                setShowScanner(false);
                if (scanner) scanner.clear();
            }, (error) => {
                console.warn(error);
            });
        }
        return () => {
            if (scanner) {
                scanner.clear().catch(err => console.error("Scanner clear error", err));
            }
        };
    }, [showScanner]);

    const fetchItems = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('items')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Erreur:', error);
        } else {
            const today = new Date().toISOString().split('T')[0];
            const itemsToReset: string[] = [];
            const processedItems = (data || []).map((item: Item) => {
                if (item.last_sold_reset !== today) {
                    itemsToReset.push(item.id);
                    return { ...item, sold_quantity: 0, last_sold_reset: today };
                }
                return item;
            });
            setItems(processedItems);

            if (itemsToReset.length > 0) {
                await Promise.all(itemsToReset.map(id =>
                    supabase.from('items').update({ sold_quantity: 0, last_sold_reset: today }).eq('id', id)
                ));
            }
        }
        setLoading(false);
    };

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        const titleRegex = /^[A-Za-zÀ-ÿ\s]+$/;
        if (!titleRegex.test(newItem.title)) return alert("L'intitulé doit contenir uniquement des lettres.");
        if (!/^\d{13}$/.test(newItem.ean)) return alert("L'EAN doit faire 13 chiffres.");

        const { error } = await supabase.from('items').insert([{
            title: newItem.title.trim(),
            ean: newItem.ean,
            quantity: parseInt(newItem.quantity) || 0,
            sold_quantity: parseInt(newItem.sold_quantity) || 0,
            category: newItem.category,
            purchase_price: parseFloat(newItem.purchase_price) || 0,
            sale_price: parseFloat(newItem.sale_price) || 0,
            last_sold_reset: new Date().toISOString().split('T')[0]
        }]);

        if (error) alert("Erreur: " + error.message);
        else setNewItem({ title: '', ean: '', quantity: '', sold_quantity: '0', category: 'Général', purchase_price: '', sale_price: '' });
    };

    const updateQuantity = async (id: string, field: 'quantity' | 'sold_quantity', delta: number) => {
        const item = items.find(i => i.id === id);
        if (!item) return;

        const updates: any = {};
        const newValue = Math.max(0, (item[field] || 0) + delta);
        updates[field] = newValue;

        if (field === 'sold_quantity') {
            updates.quantity = Math.max(0, (item.quantity || 0) - delta);
            updates.last_sold_reset = new Date().toISOString().split('T')[0];
        }

        await supabase.from('items').update(updates).eq('id', id);
    };

    const deleteItem = async (id: string) => {
        if (confirm("Supprimer cet article ?")) {
            await supabase.from('items').delete().eq('id', id);
        }
    };

    const filteredItems = items.filter(item =>
        (item.title?.toLowerCase().includes(search.toLowerCase()) || item.ean?.includes(search)) &&
        (categoryFilter === 'Tous' || item.category === categoryFilter)
    );

    // Statistiques Financières
    const totalStockValue = items.reduce((acc, item) => acc + (item.quantity * item.purchase_price), 0);
    const dailyRevenue = items.reduce((acc, item) => acc + (item.sold_quantity * item.sale_price), 0);
    const dailyProfit = items.reduce((acc, item) => acc + (item.sold_quantity * (item.sale_price - item.purchase_price)), 0);
    const lowStockCount = items.filter(item => item.quantity <= 1).length;

    const categories = ['Tous', ...new Set(items.map(i => i.category || 'Général'))];

    return (
        <div className="container">
            {showScanner && (
                <div className="scanner-container">
                    <div className="glass-card" style={{ width: '90%', maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '1rem', color: 'white' }}>Scanner le code EAN</h2>
                        <div id="reader"></div>
                        <button className="scanner-btn" onClick={() => setShowScanner(false)}>Fermer</button>
                    </div>
                </div>
            )}

            <header>
                <div className="logo-container">
                    <img src="/logo.jpg" alt="Logo" className="site-logo" />
                </div>
                <h1>Lovely Shopping</h1>
                <p className="subtitle">Votre Boutique, Votre Style</p>
            </header>

            <section className="stats-dashboard">
                <div className="glass-card stat-card">
                    <TrendingUp className="stat-icon" size={20} color="#fb6f92" />
                    <div className="stat-value">{dailyRevenue.toFixed(2)} €</div>
                    <div className="stat-label">Chiffre d'Affaire (Jour)</div>
                </div>
                <div className="glass-card stat-card">
                    <ShoppingCart className="stat-icon" size={20} color="#38b000" />
                    <div className="stat-value">{dailyProfit.toFixed(2)} €</div>
                    <div className="stat-label">Bénéfice (Jour)</div>
                </div>
                <div className="glass-card stat-card">
                    <Package className="stat-icon" size={20} color="#ffb703" />
                    <div className="stat-value">{totalStockValue.toFixed(2)} €</div>
                    <div className="stat-label">Valeur du Stock Total</div>
                </div>
                {lowStockCount > 0 && (
                    <div className="glass-card stat-card stock-alert">
                        <AlertTriangle size={20} color="#d90429" />
                        <div className="stat-value" style={{ color: '#d90429' }}>{lowStockCount}</div>
                        <div className="stat-label" style={{ color: '#d90429' }}>Articles en Rupture</div>
                    </div>
                )}
            </section>

            <div className="grid">
                <aside>
                    <div className="glass-card">
                        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Plus size={20} /> Nouvel Article
                        </h2>
                        <form onSubmit={handleAddItem}>
                            <div className="form-group">
                                <label>Intitulé</label>
                                <input type="text" value={newItem.title} onChange={e => setNewItem({ ...newItem, title: e.target.value })} required pattern="[A-Za-zÀ-ÿ\s]+" />
                            </div>
                            <div className="form-group">
                                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    Code EAN
                                    <Scan size={16} style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => setShowScanner(true)} />
                                </label>
                                <input type="text" value={newItem.ean} onChange={e => setNewItem({ ...newItem, ean: e.target.value })} maxLength={13} required />
                            </div>
                            <div className="form-group">
                                <label>Catégorie</label>
                                <input type="text" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} list="cat-suggestions" />
                                <datalist id="cat-suggestions">
                                    <option value="Robes" />
                                    <option value="Bijoux" />
                                    <option value="Accessoires" />
                                    <option value="Sacs" />
                                </datalist>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label>Prix Achat (€)</label>
                                    <input type="number" step="0.01" value={newItem.purchase_price} onChange={e => setNewItem({ ...newItem, purchase_price: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Prix Vente (€)</label>
                                    <input type="number" step="0.01" value={newItem.sale_price} onChange={e => setNewItem({ ...newItem, sale_price: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Quantité Initiale</label>
                                <input type="number" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: e.target.value })} />
                            </div>
                            <button type="submit">Enregistrer</button>
                        </form>
                    </div>
                </aside>

                <main>
                    <div className="search-container" style={{ display: 'flex', gap: '1rem' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} size={18} />
                            <input type="text" className="glass-card" style={{ paddingLeft: '2.8rem' }} placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <div style={{ position: 'relative', width: '150px' }}>
                            <Filter style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} size={16} />
                            <select className="glass-card" style={{ width: '100%', paddingLeft: '2.5rem', appearance: 'none', height: '100%' }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="glass-card">
                        <div className="item-list">
                            {filteredItems.map(item => (
                                <div key={item.id} className={`item-card ${item.quantity <= 1 ? 'stock-alert' : ''}`}>
                                    <div className="item-info">
                                        <div className="item-title">{item.title}</div>
                                        <div className="item-ean">EAN: {item.ean}</div>
                                        <span className="category-badge">{item.category}</span>
                                    </div>

                                    <div className="item-stats">
                                        <div className="stat-group">
                                            <span className="stat-label">Stock</span>
                                            <div className="qty-controls">
                                                <button className="qty-btn" onClick={() => updateQuantity(item.id, 'quantity', -1)}>-</button>
                                                <span className="qty-badge">{item.quantity}</span>
                                                <button className="qty-btn" onClick={() => updateQuantity(item.id, 'quantity', 1)}>+</button>
                                            </div>
                                        </div>

                                        <div className="stat-group">
                                            <span className="stat-label">Vendu</span>
                                            <div className="qty-controls">
                                                <button className="qty-btn" onClick={() => updateQuantity(item.id, 'sold_quantity', -1)}>-</button>
                                                <span className="qty-badge sold">{item.sold_quantity || 0}</span>
                                                <button className="qty-btn" onClick={() => updateQuantity(item.id, 'sold_quantity', 1)}>+</button>
                                            </div>
                                        </div>

                                        <button className="delete-btn" onClick={() => deleteItem(item.id)}>
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}

export default App
