import { useState, useEffect } from 'react'

interface Item {
    id: string;
    title: string;
    ean: string;
    quantity: number;
}

function App() {
    const [items, setItems] = useState<Item[]>(() => {
        const saved = localStorage.getItem('lovely-shopping-stock');
        return saved ? JSON.parse(saved) : [];
    });

    const [search, setSearch] = useState('');
    const [newItem, setNewItem] = useState({ title: '', ean: '', quantity: '' });

    useEffect(() => {
        localStorage.setItem('lovely-shopping-stock', JSON.stringify(items));
    }, [items]);

    const handleAddItem = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItem.title || !newItem.ean || !newItem.quantity) return;

        const item: Item = {
            id: crypto.randomUUID(),
            title: newItem.title,
            ean: newItem.ean,
            quantity: parseInt(newItem.quantity),
        };

        setItems([item, ...items]);
        setNewItem({ title: '', ean: '', quantity: '' });
    };

    const deleteItem = (id: string) => {
        setItems(items.filter(item => item.id !== id));
    };

    const filteredItems = items.filter(item =>
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.ean.includes(search)
    );

    return (
        <div className="container">
            <header>
                <h1>Lovely Shopping</h1>
                <p className="subtitle">Système de Gestion des Stocks</p>
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
                                />
                            </div>
                            <div className="form-group">
                                <label>Code EAN</label>
                                <input
                                    type="text"
                                    value={newItem.ean}
                                    onChange={e => setNewItem({ ...newItem, ean: e.target.value })}
                                    placeholder="Ex: 3600523..."
                                />
                            </div>
                            <div className="form-group">
                                <label>Quantité</label>
                                <input
                                    type="number"
                                    value={newItem.quantity}
                                    onChange={e => setNewItem({ ...newItem, quantity: e.target.value })}
                                    placeholder="0"
                                />
                            </div>
                            <button type="submit">Enregistrer l'article</button>
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
                        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>Inventaire ({filteredItems.length})</h2>
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
                                    {search ? "Aucun article ne correspond à votre recherche." : "Votre inventaire est vide."}
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
