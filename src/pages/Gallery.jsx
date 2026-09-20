import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import pokedex from '../data/pokédex.json';

// Helper to convert "#0181" or 181 to a clean integer 181
function parsePokeId(rawId) {
  if (!rawId) return null;
  const cleaned = String(rawId).replace(/[^0-9]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

export default function Gallery({ instructorMode = false }) {
  const [drawings, setDrawings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [missingSearch, setMissingSearch] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  const { artistParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pokemonSearch, setPokemonSearch] = useState('');
  const [artistSearch, setArtistSearch] = useState(artistParam || searchParams.get('artist') || '');
  const [sortBy, setSortBy] = useState('newest');

  // Map each Pokémon name to its parsed numeric ID and entry
  const pokedexByName = useMemo(() => {
    const map = new Map();
    pokedex.forEach((p) => {
      if (p?.name?.english) {
        map.set(p.name.english.toLowerCase().trim(), {
          ...p,
          numericId: parsePokeId(p.id)
        });
      }
    });
    return map;
  }, []);

  useEffect(() => {
    const urlArtist = searchParams.get('artist');
    if (urlArtist) setArtistSearch(urlArtist);
  }, [searchParams]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsAdmin(true);
    });

    fetchDrawings();
  }, [instructorMode]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pokemonSearch, artistSearch, sortBy, pageSize]);

  async function fetchDrawings() {
    setLoading(true);
    try {
      let query = supabase.from('submissions').select('*').eq('is_approved', true);
      if (instructorMode) query = query.eq('artist_name', 'Kavhan');

      const { data, error } = await query;
      if (error) console.error(error);
      else setDrawings(data || []);
    } catch (err) {
      console.error('Fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(item, e) {
    if (e) e.stopPropagation();

    const confirmed = window.confirm(
      `⚠️ PERMANENT DELETE\n\nAre you sure you want to remove "${item.pokemon_name}" drawn by "${item.artist_name}"?`
    );
    if (!confirmed) return;

    try {
      const urlParts = item.image_url.split('/');
      const fileName = urlParts[urlParts.length - 1];

      if (fileName) {
        await supabase.storage.from('drawings').remove([fileName]);
      }

      await supabase.from('submissions').delete().eq('id', item.id);
      setDrawings((prev) => prev.filter((d) => d.id !== item.id));

      if (selectedArtwork?.id === item.id) setSelectedArtwork(null);
      alert(`"${item.pokemon_name}" removed.`);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  async function toggleFeature(item, e) {
    if (e) e.stopPropagation();
    const updated = !item.is_featured;
    await supabase.from('submissions').update({ is_featured: updated }).eq('id', item.id);
    setDrawings((prev) => prev.map((d) => d.id === item.id ? { ...d, is_featured: updated } : d));
  }

  const missingPokemonList = useMemo(() => {
    const drawnSet = new Set(drawings.map((d) => d.pokemon_name.toLowerCase().trim()));
    return pokedex.filter((p) => p?.name?.english && !drawnSet.has(p.name.english.toLowerCase().trim()));
  }, [drawings]);

  const filteredMissing = useMemo(() => {
    if (!missingSearch.trim()) return missingPokemonList;
    const q = missingSearch.toLowerCase().trim();
    const cleanNum = parsePokeId(q);

    return missingPokemonList.filter((p) => {
      const pNum = parsePokeId(p.id);
      return (
        (cleanNum !== null && (pNum === cleanNum || String(pNum).startsWith(String(cleanNum)))) ||
        p.name.english.toLowerCase().includes(q) ||
        (p.name.japanese && p.name.japanese.includes(q))
      );
    });
  }, [missingPokemonList, missingSearch]);

  // 🔍 Reliable Search: works with names, exact IDs, and partial numbers
  const filteredDrawings = useMemo(() => {
    const cleanSearch = pokemonSearch.toLowerCase().trim();
    const isOnlyDigits = /^#?\d+$/.test(cleanSearch);
    const searchNumber = parsePokeId(cleanSearch);

    return drawings
      .filter((item) => {
        const pData = pokedexByName.get(item.pokemon_name.toLowerCase().trim());
        const pNum = pData?.numericId;

        let matchesPokemon = false;

        if (!cleanSearch) {
          matchesPokemon = true;
        } else if (isOnlyDigits && searchNumber !== null && pNum !== null) {
          // If searching with numbers (e.g. 181, 25, or 18)
          matchesPokemon = pNum === searchNumber || String(pNum).startsWith(String(searchNumber));
        } else {
          matchesPokemon = (
            item.pokemon_name.toLowerCase().includes(cleanSearch) ||
            (pData?.name?.japanese && pData.name.japanese.includes(cleanSearch))
          );
        }

        const matchesArtist = item.artist_name
          .toLowerCase()
          .includes(artistSearch.toLowerCase().trim());

        return matchesPokemon && matchesArtist;
      })
      .sort((a, b) => {
        if (sortBy === 'featured') return (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0);
        if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
        if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
        if (sortBy === 'pokemon_az') return a.pokemon_name.localeCompare(b.pokemon_name);
        if (sortBy === 'artist_az') return a.artist_name.localeCompare(b.artist_name);
        return 0;
      });
  }, [drawings, pokemonSearch, artistSearch, sortBy, pokedexByName]);

  const totalPages = Math.ceil(filteredDrawings.length / pageSize) || 1;
  const paginatedDrawings = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredDrawings.slice(startIdx, startIdx + pageSize);
  }, [filteredDrawings, currentPage, pageSize]);

  return (
    <div style={{
      flex: 1,
      minHeight: 'calc(100dvh - 54px)',
      width: '100%',
      backgroundImage: 'linear-gradient(rgba(18, 18, 18, 0.88), rgba(18, 18, 18, 0.88)), url(/pokeballs.jpg)',
      backgroundRepeat: 'repeat',
      backgroundSize: '240px auto',
      padding: '30px 20px 60px',
      boxSizing: 'border-box',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        
        {/* Header */}
        <header style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px', 
          flexWrap: 'wrap', 
          gap: '15px',
          background: 'rgba(255, 255, 255, 0.96)',
          padding: '16px 22px',
          borderRadius: '12px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.15)'
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', color: '#000', fontWeight: 'bold' }}>
              {instructorMode ? "Kavhan's Drawings 🎨" : "Pokémon Community Museum"}
            </h1>
            <p style={{ margin: '4px 0 0 0', color: '#444', fontSize: '14px' }}>
              {drawings.length} drawings exhibited &bull; {missingPokemonList.length} pokémon remaining to be drawn!
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowMissingModal(true)}
              style={{
                padding: '10px 16px',
                background: '#e0f2fe',
                color: '#0369a1',
                border: '1.5px solid #38bdf8',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              📖 Missing Pokémon ({missingPokemonList.length})
            </button>

            {(!instructorMode || isAdmin) && (
              <Link to="/submit">
                <button style={{ 
                  padding: '10px 18px', 
                  background: '#ff9800', 
                  color: '#000', 
                  border: '1.5px solid #000', 
                  borderRadius: '6px', 
                  fontWeight: 'bold', 
                  cursor: 'pointer', 
                  fontSize: '14px'
                }}>
                  Submit Artwork 🎨
                </button>
              </Link>
            )}
          </div>
        </header>

        {/* Filter Bar */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          flexWrap: 'wrap',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.96)',
          padding: '14px 18px',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.12)'
        }}>
          <input 
            type="text"
            placeholder="🔍 Search Pokémon name or number (e.g. 181)..."
            value={pokemonSearch}
            onChange={(e) => setPokemonSearch(e.target.value)}
            style={{ padding: '9px 14px', flex: '1', minWidth: '180px', borderRadius: '6px', border: '1.5px solid #ccc' }}
          />

          {!instructorMode && (
            <input 
              type="text"
              placeholder="🎨 Search Artist..."
              value={artistSearch}
              onChange={(e) => setArtistSearch(e.target.value)}
              style={{ padding: '9px 14px', flex: '1', minWidth: '160px', borderRadius: '6px', border: '1.5px solid #ccc' }}
            />
          )}

          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: '9px 14px', borderRadius: '6px', border: '1.5px solid #ccc', cursor: 'pointer', fontWeight: '500' }}
          >
            <option value="featured">⭐ First</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="pokemon_az">Pokémon (A–Z)</option>
          </select>

          <select 
            value={pageSize} 
            onChange={(e) => setPageSize(Number(e.target.value))}
            style={{ padding: '9px 14px', borderRadius: '6px', border: '1.5px solid #ccc', cursor: 'pointer' }}
          >
            <option value={24}>24 / page</option>
            <option value={48}>48 / page</option>
            <option value={96}>96 / page</option>
          </select>
        </div>

        {/* Gallery Grid */}
        {loading ? (
          <p style={{ color: '#fff', textAlign: 'center', padding: '40px', fontSize: '18px' }}>Loading drawings...</p>
        ) : filteredDrawings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', background: 'rgba(255,255,255,0.95)', borderRadius: '12px' }}>
            <h3>No drawings found!</h3>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' }}>
              {paginatedDrawings.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => setSelectedArtwork(item)}
                  style={{ 
                    border: item.is_featured ? '2.5px solid #f59e0b' : '1px solid #ccc', 
                    borderRadius: '10px', 
                    overflow: 'hidden', 
                    background: '#ffffff',
                    boxShadow: item.is_featured ? '0 0 16px rgba(245, 158, 11, 0.45)' : '0 4px 12px rgba(0,0,0,0.12)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative'
                  }}
                >
                  {item.is_featured && (
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      background: '#f59e0b',
                      color: '#000',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                      fontSize: '11px',
                      zIndex: 2,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                      ⭐ Featured
                    </div>
                  )}

                  <div style={{ height: '240px', background: '#f2f4f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                    <img 
                      src={item.image_url} 
                      alt={item.pokemon_name} 
                      loading="lazy" 
                      decoding="async" 
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                    />
                  </div>

                  {/* Clean Title: Number removed from card, just the Pokémon Name */}
                  <div style={{ padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#000', fontWeight: 'bold' }}>
                        {item.pokemon_name}
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px', color: '#444' }}>
                        By: <span style={{ color: '#0070f3', fontWeight: 'bold' }}>{item.artist_name}</span>
                      </p>
                    </div>

                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          onClick={(e) => toggleFeature(item, e)}
                          title={item.is_featured ? 'Remove Staff Pick' : 'Make Staff Pick'}
                          style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer' }}
                        >
                          {item.is_featured ? '⭐' : '☆'}
                        </button>
                        <button
                          onClick={(e) => handleDelete(item, e)}
                          style={{
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #f87171',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          Delete 🗑️
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '12px',
                marginTop: '35px',
                background: 'rgba(255,255,255,0.96)',
                padding: '12px 20px',
                borderRadius: '10px',
                width: 'fit-content',
                margin: '35px auto 0 auto'
              }}>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #ccc', cursor: 'pointer' }}
                >
                  ← Prev
                </button>
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #ccc', cursor: 'pointer' }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}

        {/* 📖 Missing Pokémon Tracker Modal */}
        {showMissingModal && (
          <div onClick={() => setShowMissingModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '850px', height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h2 style={{ margin: 0, fontSize: '20px' }}>Unclaimed Pokémon ({missingPokemonList.length} remaining) 📖</h2>
                  <button onClick={() => setShowMissingModal(false)} style={{ border: 'none', background: 'none', fontSize: '22px', cursor: 'pointer' }}>✕</button>
                </div>
                <input
                  type="text"
                  placeholder="🔍 Search missing by name or number (e.g. 37, 18)..."
                  value={missingSearch}
                  onChange={(e) => setMissingSearch(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', alignContent: 'start' }}>
                {filteredMissing.map((p) => {
                  const cleanId = parsePokeId(p.id);
                  return (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '13px', fontWeight: 'bold' }}>#{cleanId} {p.name.english}</span>
                      <Link to={`/submit?pokemon=${encodeURIComponent(p.name.english)}`}>
                        <button style={{ background: '#22c55e', color: '#000', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                          Draw 🎨
                        </button>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Lightbox Modal */}
        {selectedArtwork && (
          <div onClick={() => setSelectedArtwork(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '10px', maxWidth: '90vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ maxHeight: '75vh', background: '#111', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <img src={selectedArtwork.image_url} alt="" style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{selectedArtwork.pokemon_name}</h2>
                  <p style={{ margin: '4px 0 0 0' }}>Drawn by: <strong>{selectedArtwork.artist_name}</strong></p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {isAdmin && (
                    <button
                      onClick={(e) => handleDelete(selectedArtwork, e)}
                      style={{ padding: '8px 14px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #f87171', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Delete 🗑️
                    </button>
                  )}
                  <button onClick={() => setSelectedArtwork(null)} style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ccc' }}>
                    Close ✕
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}