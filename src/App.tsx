import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

interface Item {
    id: string;
    title: string;
    ean: string;
    quantity: number;
    sold_quantity: number;
    last_sold_reset: string;
}

function App() {
    const [items, setItems] = useState<Item[]>([]);
    const [search, setSearch] = useState('');
    const [newItem, setNewItem] = useState({ title: '', ean: '', quantity: '', sold_quantity: '0' });
    const [loading, setLoading] = useState(true);

    // Charger les articles au démarrage
    useEffect(() => {
        fetchItems();

        // Configuration du Realtime
        const channel = supabase
            .channel('items-db-changes')
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

    const fetchItems = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('items')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Erreur lors du chargement des articles:', error);
        } else {
            const today = new Date().toISOString().split('T')[0];
            const itemsToReset: string[] = [];

            const processedItems = (data || []).map((item: Item) => {
                // Si la date de réinitialisation est différente d'aujourd'hui, on reset localement
                // et on prépare la mise à jour en base
                if (item.last_sold_reset !== today) {
                    itemsToReset.push(item.id);
                    return { ...item, sold_quantity: 0, last_sold_reset: today };
                }
                return item;
            });

            setItems(processedItems);

            // Reset en base de données pour les articles concernés
            if (itemsToReset.length > 0) {
                await Promise.all(itemsToReset.map(id =>
                    supabase
                        .from('items')
                        .update({ sold_quantity: 0, last_sold_reset: today })
                        .eq('id', id)
                ));
            }
        }
        setLoading(false);
    };

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation Intitulé (Lettres uniquement)
        const titleRegex = /^[A-Za-zÀ-ÿ\s]+$/;
        if (!titleRegex.test(newItem.title)) {
            alert("L'intitulé ne doit contenir que des lettres.");
            return;
        }

        // Validation EAN (13 chiffres)
        const eanRegex = /^\d{13}$/;
        if (!eanRegex.test(newItem.ean)) {
            alert("Le code EAN doit comporter exactement 13 chiffres.");
            return;
        }

        if (!newItem.quantity) return;

        const today = new Date().toISOString().split('T')[0];

        const { error } = await supabase
            .from('items')
            .insert([
                {
                    title: newItem.title.trim(),
                    ean: newItem.ean,
                    quantity: parseInt(newItem.quantity),
                    sold_quantity: parseInt(newItem.sold_quantity) || 0,
                    last_sold_reset: today
                },
            ]);

        if (error) {
            alert("Erreur lors de l'ajout de l'article : " + error.message);
        } else {
            setNewItem({ title: '', ean: '', quantity: '', sold_quantity: '0' });
        }
    };

    const updateQuantity = async (id: string, field: 'quantity' | 'sold_quantity', delta: number) => {
        const item = items.find(i => i.id === id);
        if (!item) return;

        const updates: any = {};
        const newValue = Math.max(0, (item[field] || 0) + delta);
        updates[field] = newValue;

        if (field === 'sold_quantity') {
            const stockDelta = -delta;
            updates.quantity = Math.max(0, (item.quantity || 0) + stockDelta);
            updates.last_sold_reset = new Date().toISOString().split('T')[0];
        }

        const { error } = await supabase
            .from('items')
            .update(updates)
            .eq('id', id);

        if (error) {
            alert("Erreur lors de la mise à jour : " + error.message);
        }
    };

    const deleteItem = async (id: string) => {
        if (!confirm("Voulez-vous vraiment supprimer cet article ?")) return;
        const { error } = await supabase
            .from('items')
            .delete()
            .eq('id', id);

        if (error) {
            alert("Erreur lors de la suppression : " + error.message);
        }
    };

    const filteredItems = items.filter(item =>
        item.title?.toLowerCase().includes(search.toLowerCase()) ||
        item.ean?.includes(search)
    );

    return (
        <div className="container">
            <header>
                <div className="logo-container">
                    <img src="/logo.jpg" alt="Lovely Shopping Logo" className="site-logo" />
                </div>
                <h1>Lovely Shopping</h1>
                <p className="subtitle">Votre Boutique, Votre Style</p>
            </header>

            <div className="grid">
                <aside>
                    <div className="glass-card">
                        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>Nouvel Article</h2>
                        <form onSubmit={handleAddItem}>
                            <div className="form-group">
                                <label>Intitulé</label>
                                <input
                                    type="text"
                                    value={newItem.title}
                                    onChange={e => setNewItem({ ...newItem, title: e.target.value })}
                                    placeholder="Ex: Robe en soie"
                                    disabled={loading}
                                    required
                                    pattern="[A-Za-zÀ-ÿ\s]+"
                                    title="Lettres uniquement"
                                />
                            </div>
                            <div className="form-group">
                                <label>Code EAN</label>
                                <input
                                    type="text"
                                    value={newItem.ean}
                                    onChange={e => setNewItem({ ...newItem, ean: e.target.value })}
                                    placeholder="13 chiffres (Ex: 3600523...)"
                                    disabled={loading}
                                    required
                                    maxLength={13}
                                    pattern="\d{13}"
                                    title="Exactement 13 chiffres"
                                />
                            </div>
                            <div className="form-group">
                                <label>Quantité en Stock</label>
                                <input
                                    type="number"
                                    value={newItem.quantity}
                                    onChange={e => setNewItem({ ...newItem, quantity: e.target.value })}
                                    placeholder="0"
                                    disabled={loading}
                                />
                            </div>
                            <div className="form-group">
                                <label>Quantité Vendue (Initial)</label>
                                <input
                                    type="number"
                                    value={newItem.sold_quantity}
                                    onChange={e => setNewItem({ ...newItem, sold_quantity: e.target.value })}
                                    placeholder="0"
                                    disabled={loading}
                                />
                            </div>
                            <button type="submit" disabled={loading}>
                                {loading ? 'Connexion...' : 'Enregistrer l\'article'}
                            </button>
                        </form>
                    </div>
                </aside>

                <main>
                    <div className="search-container">
                        <input
                            type="text"
                            className="glass-card"
                            style={{ width: '100%', padding: '1rem' }}
                            placeholder="Rechercher par intitulé ou EAN..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="glass-card">
                        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.2rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Inventaire ({filteredItems.length})</span>
                            {loading && <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Chargement...</span>}
                        </h2>
                        <div className="item-list">
                            {filteredItems.length > 0 ? (
                                filteredItems.map(item => (
                                    <div key={item.id} className="item-card">
                                        <div className="item-info">
                                            <div className="item-title">{item.title}</div>
                                            <div className="item-ean">EAN: {item.ean}</div>
                                        </div>

                                        <div className="item-stats">
                                            <div className="stat-group">
                                                <span className="stat-label">Stock</span>
                                                <div className="qty-controls">
                                                    <button className="qty-btn" type="button" onClick={() => updateQuantity(item.id, 'quantity', -1)}>-</button>
                                                    <span className="qty-badge">{item.quantity}</span>
                                                    <button className="qty-btn" type="button" onClick={() => updateQuantity(item.id, 'quantity', 1)}>+</button>
                                                </div>
                                            </div>

                                            <div className="stat-group">
                                                <span className="stat-label">Vendu (Jour)</span>
                                                <div className="qty-controls">
                                                    <button className="qty-btn" type="button" onClick={() => updateQuantity(item.id, 'sold_quantity', -1)}>-</button>
                                                    <span className="qty-badge sold">{item.sold_quantity || 0}</span>
                                                    <button className="qty-btn" type="button" onClick={() => updateQuantity(item.id, 'sold_quantity', 1)}>+</button>
                                                </div>
                                            </div>

                                            <button className="delete-btn" type="button" onClick={() => deleteItem(item.id)} title="Supprimer">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6"></polyline>
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="empty-state">
                                    {!loading && (search ? "Aucun article trouvé." : "L'inventaire est vide.")}
                                    {loading && "Chargement des stocks..."}
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}

export default App
