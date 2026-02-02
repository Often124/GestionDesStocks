import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

interface Item {
    id: string;
    title: string;
    ean: string;
    quantity: number;
}

function App() {
    const [items, setItems] = useState<Item[]>([]);
    const [search, setSearch] = useState('');
    const [newItem, setNewItem] = useState({ title: '', ean: '', quantity: '' });
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
            setItems(data || []);
        }
        setLoading(false);
    };

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItem.title || !newItem.ean || !newItem.quantity) return;

        const { error } = await supabase
            .from('items')
            .insert([
                {
                    title: newItem.title,
                    ean: newItem.ean,
                    quantity: parseInt(newItem.quantity),
                },
            ]);

        if (error) {
            alert("Erreur lors de l'ajout de l'article : " + error.message);
        } else {
            setNewItem({ title: '', ean: '', quantity: '' });
        }
    };

    const deleteItem = async (id: string) => {
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
                                    placeholder="Ex: T-shirt en soie"
                                    disabled={loading}
                                />
                            </div>
                            <div className="form-group">
                                <label>Code EAN</label>
                                <input
                                    type="text"
                                    value={newItem.ean}
                                    onChange={e => setNewItem({ ...newItem, ean: e.target.value })}
                                    placeholder="Ex: 3600523..."
                                    disabled={loading}
                                />
                            </div>
                            <div className="form-group">
                                <label>Quantité</label>
                                <input
                                    type="number"
                                    value={newItem.quantity}
                                    onChange={e => setNewItem({ ...newItem, quantity: e.target.value })}
                                    placeholder="0"
                                    disabled={loading}
                                />
                            </div>
                            <button type="submit" disabled={loading}>
                                {loading ? 'Connexion en cours...' : 'Enregistrer l\'article'}
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
                        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>
                            Inventaire ({filteredItems.length})
                            {loading && <span style={{ fontSize: '0.8rem', marginLeft: '1rem', color: 'var(--text-dim)' }}>Chargement...</span>}
                        </h2>
                        <div className="item-list">
                            {filteredItems.length > 0 ? (
                                filteredItems.map(item => (
                                    <div key={item.id} className="item-card">
                                        <div className="item-info">
                                            <div className="item-title">{item.title}</div>
                                            <div className="item-ean">EAN: {item.ean}</div>
                                        </div>
                                        <div className="item-qty">
                                            <span className="qty-badge">{item.quantity} en stock</span>
                                            <button className="delete-btn" onClick={() => deleteItem(item.id)}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6"></polyline>
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="empty-state">
                                    {!loading && (search ? "Aucun article ne correspond à votre recherche." : "Votre inventaire est vide.")}
                                    {loading && "Connexion à Supabase..."}
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
