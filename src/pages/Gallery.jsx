import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import pokedex from '../data/pokédex.json';
import AutoFitImage from '../components/AutoFitImage';

function parsePokeId(rawId) {
  if (!rawId) return null;
  const cleaned = String(rawId).replace(/[^0-9]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

const TYPE_COLORS = {
  Normal: '#A8A77A',
  Fire: '#EE8130',
  Water: '#6390F0',
  Electric: '#F7D02C',
  Grass: '#7AC74C',
  Ice: '#96D9D6',
  Fighting: '#C22E28',
  Poison: '#A33EA1',
  Ground: '#E2BF65',
  Flying: '#A98FF3',
  Psychic: '#F95587',
  Bug: '#A6B91A',
  Rock: '#B6A136',
  Ghost: '#735797',
  Dragon: '#6F35FC',
  Steel: '#B7B7CE',
  Fairy: '#D685AD',
  Dark: '#705746'
};

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export default function Gallery({ instructorMode = false }) {
  const [drawings, setDrawings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [missingSearch, setMissingSearch] = useState('');
  const [copiedExclusion, setCopiedExclusion] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  const { artistParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pokemonSearch, setPokemonSearch] = useState('');
  const [artistSearch, setArtistSearch] = useState(artistParam || searchParams.get('artist') || '');
  const [sortBy, setSortBy] = useState('newest');

  const pokedexByName = useMemo(() => {
    const map = new Map();
    pokedex.forEach((p) => {
      if (p?.name?.english) {
        const types = p.formData?.[0]?.type || ['Normal'];
        map.set(p.name.english.toLowerCase().trim(), {
          ...p,
          numericId: parsePokeId(p.id),
          types
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

  function handleArtistClick(artistName, e) {
    if (e) e.stopPropagation();
    setArtistSearch(artistName);
    setSearchParams({ artist: artistName });
    if (selectedArtwork) setSelectedArtwork(null);
  }

  function clearAllFilters() {
    setPokemonSearch('');
    setArtistSearch('');
    setSearchParams({});
  }

  async function handleDelete(item, e) {
    if (e) e.stopPropagation();

    const confirmed = window.confirm(
      `Permanent Delete: Are you sure you want to remove "${item.pokemon_name}" drawn by "${item.artist_name}"?`
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

  const drawnDexNumbers = useMemo(() => {
    const ids = new Set();
    drawings.forEach((d) => {
      const info = pokedexByName.get(d.pokemon_name.toLowerCase().trim());
      if (info?.numericId) {
        ids.add(info.numericId);
      }
    });
    return Array.from(ids).sort((a, b) => a - b);
  }, [drawings, pokedexByName]);

  function copyExclusionList() {
    const text = drawnDexNumbers.join(', ');
    navigator.clipboard.writeText(text);
    setCopiedExclusion(true);
    setTimeout(() => setCopiedExclusion(false), 2500);
  }

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

  const hasActiveFilters = pokemonSearch.trim() !== '' || artistSearch.trim() !== '';

  return (
    <div style={{
      flex: 1,
      minHeight: 'calc(100dvh - 54px)',
      width: '100%',
      backgroundImage: 'linear-gradient(rgba(18, 18, 18, 0.88), rgba(18, 18, 18, 0.88)), url(/pokeballs.jpg)',
      backgroundRepeat: 'repeat',
      backgroundSize: '240px auto',
      padding: '24px 16px 60px',
      boxSizing: 'border-box',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ maxWidth: '1700px', margin: '0 auto', width: '100%' }}>
        
        {/* Header */}
        <header style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px', 
          flexWrap: 'wrap', 
          gap: '15px',
          background: 'rgba(255, 255, 255, 0.96)',
          padding: '18px 24px',
          borderRadius: '12px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.15)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img 
                src={instructorMode ? "/kavhan.png" : "/Piplup.png"} 
                alt="Logo" 
                style={{ width: '42px', height: '42px', objectFit: 'contain' }} 
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <h1 style={{ margin: 0, fontSize: '26px', color: '#000', fontWeight: 'bold' }}>
                {instructorMode ? "Kavhan's Drawings" : "Pokémon Community Museum"}
              </h1>
            </div>
            <p style={{ margin: '6px 0 0 0', color: '#444', fontSize: '14px' }}>
              {drawings.length} drawings exhibited &bull; {missingPokemonList.length} pokémon remaining to be drawn!
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
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
              Missing Pokémon ({missingPokemonList.length})
            </button>

            <button
              onClick={copyExclusionList}
              title="Copy already drawn Pokédex numbers for your wheel spinner"
              style={{
                padding: '10px 14px',
                background: copiedExclusion ? '#15803d' : '#f3f4f6',
                color: copiedExclusion ? '#fff' : '#1f2937',
                border: '1.5px solid #9ca3af',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              {copiedExclusion ? 'Copied Wheel Exclusions!' : 'Copy Drawn IDs'}
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
                  Submit Artwork
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
            placeholder="Search Pokémon name or number (e.g. 181)..."
            value={pokemonSearch}
            onChange={(e) => setPokemonSearch(e.target.value)}
            style={{ padding: '9px 14px', flex: '1', minWidth: '180px', borderRadius: '6px', border: '1.5px solid #ccc' }}
          />

          {!instructorMode && (
            <input 
              type="text"
              placeholder="Search Artist..."
              value={artistSearch}
              onChange={(e) => {
                setArtistSearch(e.target.value);
                if (!e.target.value) setSearchParams({});
              }}
              style={{ padding: '9px 14px', flex: '1', minWidth: '160px', borderRadius: '6px', border: '1.5px solid #ccc' }}
            />
          )}

          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: '9px 14px', borderRadius: '6px', border: '1.5px solid #ccc', cursor: 'pointer', fontWeight: '500' }}
          >
            <option value="featured">Featured First</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="pokemon_az">Pokémon (A–Z)</option>
          </select>

          <select 
            value={pageSize} 
            onChange={(e) => setPageSize(Number(e.target.value))}
            style={{ padding: '9px 14px', borderRadius: '6px', border: '1.5px solid #ccc', cursor: 'pointer' }}
          >
            <option value={30}>30 / page</option>
            <option value={48}>48 / page</option>
            <option value={96}>96 / page</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              style={{
                background: '#ffebee',
                border: '1.5px solid #ffcdd2',
                color: '#b71c1c',
                padding: '9px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px'
              }}
            >
              Reset
            </button>
          )}
        </div>

        {/* Gallery Grid */}
        {loading ? (
          <p style={{ color: '#fff', textAlign: 'center', padding: '40px', fontSize: '18px' }}>Loading drawings...</p>
        ) : filteredDrawings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', background: 'rgba(255,255,255,0.95)', borderRadius: '12px' }}>
            <h3>No drawings found!</h3>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                style={{
                  marginTop: '12px',
                  background: '#ff9800',
                  color: '#000',
                  border: '1.5px solid #000',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="museum-grid">
              {paginatedDrawings.map((item) => {
                const pokeInfo = pokedexByName.get(item.pokemon_name.toLowerCase().trim());
                const types = pokeInfo?.types || ['Normal'];
                const color1 = TYPE_COLORS[types[0]] || '#A8A77A';
                const color2 = types[1] ? (TYPE_COLORS[types[1]] || color1) : color1;

                return (
                  <div 
                    key={item.id} 
                    onClick={() => setSelectedArtwork({ ...item, pokeInfo })}
                    className="type-animated-card"
                    style={{
                      '--type-col-1': color1,
                      '--type-col-2': color2,
                      cursor: 'pointer'
                    }}
                  >
                    <div className="type-animated-card-inner">
                      {item.is_featured && (
                        <div style={{
                          position: 'absolute',
                          top: '10px',
                          left: '10px',
                          background: '#f59e0b',
                          color: '#000',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          fontSize: '11px',
                          zIndex: 2,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                        }}>
                          Featured
                        </div>
                      )}

                  {/* Image Container: Clean pure white, 0 padding, clips on hover */}
                      <div style={{ 
                        height: '240px', 
                        background: '#ffffff', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        padding: 0, /* Eliminates the grey/white line completely */
                        overflow: 'hidden', /* Cuts off cleanly during hover */
                        position: 'relative'
                      }}>
                        <AutoFitImage 
                          src={item.image_url} 
                          alt={item.pokemon_name} 
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'contain', 
                            transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)'
                          }} 
                          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                        />
                      </div>

                      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', color: '#000', fontWeight: 'bold' }}>
                              {item.pokemon_name}
                            </h3>
                            {pokeInfo?.numericId && (
                              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#888' }}>
                                #{pokeInfo.numericId}
                              </span>
                            )}
                          </div>

                          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#444' }}>
                            By:{' '}
                            <span 
                              onClick={(e) => handleArtistClick(item.artist_name, e)}
                              title={`Filter by artist ${item.artist_name}`}
                              style={{ 
                                color: '#0070f3', 
                                textDecoration: 'underline', 
                                cursor: 'pointer', 
                                fontWeight: 'bold' 
                              }}
                            >
                              {item.artist_name}
                            </span>
                          </p>

                          <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#777' }}>
                            {formatDate(item.created_at)}
                          </p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {types.map((t) => (
                              <span 
                                key={t} 
                                style={{ 
                                  background: TYPE_COLORS[t] || '#666', 
                                  color: '#fff', 
                                  fontSize: '9px', 
                                  fontWeight: 'bold', 
                                  padding: '2px 6px', 
                                  borderRadius: '4px',
                                  textTransform: 'uppercase'
                                }}
                              >
                                {t}
                              </span>
                            ))}
                          </div>

                          {isAdmin && (
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                             <button
                                onClick={(e) => toggleFeature(item, e)}
                                title={item.is_featured ? 'Remove Featured' : 'Make Featured'}
                                style={{ 
                                    background: 'transparent', 
                                    border: 'none', 
                                    fontSize: '20px', 
                                    cursor: 'pointer',
                                    color: '#eab308', /* Vibrant Golden Yellow */
                                    textShadow: '0 0 4px rgba(234, 179, 8, 0.4)'
                                }}
                                >
                                {item.is_featured ? '★' : '☆'}
                                </button>
                              <button
                                onClick={(e) => handleDelete(item, e)}
                                style={{
                                  background: '#fee2e2',
                                  color: '#b91c1c',
                                  border: '1px solid #f87171',
                                  borderRadius: '4px',
                                  padding: '2px 6px',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  fontWeight: 'bold'
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  </div>
                );
              })}
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
                  Prev
                </button>
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #ccc', cursor: 'pointer' }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* Missing Pokémon Tracker Modal */}
        {showMissingModal && (
          <div onClick={() => setShowMissingModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '850px', height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h2 style={{ margin: 0, fontSize: '20px' }}>Unclaimed Pokémon ({missingPokemonList.length} remaining)</h2>
                  <button onClick={() => setShowMissingModal(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ 
                  background: '#f8fafc', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px', 
                  padding: '10px 14px', 
                  marginBottom: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap'
                }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>
                      Wheel Spinner Exclusion List ({drawnDexNumbers.length} drawn):
                    </span>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                      {drawnDexNumbers.slice(0, 15).join(', ')}{drawnDexNumbers.length > 15 ? '...' : ''}
                    </p>
                  </div>
                  <button
                    onClick={copyExclusionList}
                    style={{
                      background: copiedExclusion ? '#15803d' : '#0284c7',
                      color: '#fff',
                      border: 'none',
                      padding: '7px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    {copiedExclusion ? 'Copied' : 'Copy Exclusion IDs'}
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Search missing by name or number (e.g. 37, 18)..."
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
                          Draw
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
                  <p style={{ margin: '4px 0 0 0' }}>
                    Drawn by:{' '}
                    <span 
                      onClick={() => handleArtistClick(selectedArtwork.artist_name)}
                      title={`Filter by artist ${selectedArtwork.artist_name}`}
                      style={{ 
                        color: '#0070f3', 
                        textDecoration: 'underline', 
                        cursor: 'pointer', 
                        fontWeight: 'bold' 
                      }}
                    >
                      {selectedArtwork.artist_name}
                    </span>
                    <span style={{ color: '#666', marginLeft: '10px', fontSize: '13px' }}>
                      &bull; {formatDate(selectedArtwork.created_at)}
                    </span>
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {isAdmin && (
                    <button
                      onClick={(e) => handleDelete(selectedArtwork, e)}
                      style={{ padding: '8px 14px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #f87171', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Delete
                    </button>
                  )}
                  <button onClick={() => setSelectedArtwork(null)} style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ccc' }}>
                    Close
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