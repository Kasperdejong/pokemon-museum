import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Link, useSearchParams } from 'react-router-dom';
import AutoFitImage from '../components/AutoFitImage';

const COOLDOWN_KEY = 'poke_museum_last_submit';
const HANDLES_KEY = 'poke_my_claimed_handles';

export default function MySubmissions() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'fanart' ? 'fanart' : 'pokemon';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [savedHandles, setSavedHandles] = useState([]);
  const [activeArtist, setActiveArtist] = useState('');
  
  // Pokémon state
  const [pokemonSubmissions, setPokemonSubmissions] = useState([]);
  const [pokemonStatusMap, setPokemonStatusMap] = useState({});

  // Fanart state
  const [fanartSubmissions, setFanartSubmissions] = useState([]);
  const [fanartStatusMap, setFanartStatusMap] = useState({});

  const [viewMode, setViewMode] = useState('showcase');
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'fanart' || tabParam === 'pokemon') {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    const handles = JSON.parse(localStorage.getItem(HANDLES_KEY) || '[]');
    setSavedHandles(handles);

    const active = localStorage.getItem('poke_active_artist') || handles[0] || '';
    setActiveArtist(active);

    const localPoke = JSON.parse(localStorage.getItem('poke_my_submissions') || '[]');
    setPokemonSubmissions(localPoke);

    const localFan = JSON.parse(localStorage.getItem('poke_my_fanart_submissions') || '[]');
    setFanartSubmissions(localFan);

    if (active) {
      syncAll(active, localPoke, localFan);
    } else {
      setLoading(false);
    }
  }, []);

  async function syncAll(artistHandle, localPoke, localFan) {
    setLoading(true);
    try {
      await Promise.all([
        syncPokemon(artistHandle, localPoke),
        syncFanart(artistHandle, localFan)
      ]);
    } catch (err) {
      console.error('Failed to sync submissions:', err);
    } finally {
      setLoading(false);
    }
  }

  // 1. Sync Pokémon Drawings: Never mark pending items as approved
  async function syncPokemon(artistHandle, localPoke) {
    try {
      // Fetch ONLY truly approved drawings from Supabase
      const { data: dbApproved } = await supabase
        .from('submissions')
        .select('*')
        .eq('artist_name', artistHandle.trim())
        .eq('is_approved', true);

      const approvedMap = new Map((dbApproved || []).map((i) => [i.id, { ...i, is_approved: true }]));

      // Verify pending items that are not in the approved list
      const pendingIds = localPoke
        .filter((item) => !approvedMap.has(item.id))
        .map((item) => item.id);

      let survivingPendingMap = new Map();
      const statusMap = {};

      if (pendingIds.length > 0) {
        const { data: statusData } = await supabase.rpc('check_submissions_status', { p_ids: pendingIds });
        if (statusData) {
          statusData.forEach((row) => {
            survivingPendingMap.set(row.id, row.is_approved);
            statusMap[row.id] = row.is_approved ? 'approved' : 'pending';
          });
        }
      }

      // Purge: If an item is NOT approved AND NOT in database status, it was rejected!
      const cleanedLocal = localPoke.filter(
        (item) => approvedMap.has(item.id) || survivingPendingMap.has(item.id)
      );

      if (cleanedLocal.length !== localPoke.length) {
        localStorage.setItem('poke_my_submissions', JSON.stringify(cleanedLocal));
      }

      // Merge: Keep approved items and surviving pending items
      const mergedMap = new Map();
      approvedMap.forEach((val, key) => mergedMap.set(key, val));
      cleanedLocal.forEach((val) => {
        if (!mergedMap.has(val.id)) {
          const isApprovedInDb = survivingPendingMap.get(val.id) === true;
          mergedMap.set(val.id, { ...val, is_approved: isApprovedInDb });
        }
      });

      setPokemonSubmissions(Array.from(mergedMap.values()));
      setPokemonStatusMap(statusMap);
    } catch (err) {
      console.error('Error syncing pokemon:', err);
    }
  }

  // 2. Sync Fanart: Never mark pending items as approved
  async function syncFanart(artistHandle, localFan) {
    try {
      // Fetch ONLY truly approved fanart from Supabase
      const { data: dbApproved } = await supabase
        .from('fanart_submissions')
        .select('*')
        .eq('artist_name', artistHandle.trim())
        .eq('is_approved', true);

      const approvedMap = new Map((dbApproved || []).map((i) => [i.id, { ...i, is_approved: true }]));

      const pendingIds = localFan
        .filter((item) => !approvedMap.has(item.id))
        .map((item) => item.id);

      let survivingPendingMap = new Map();
      const statusMap = {};

      if (pendingIds.length > 0) {
        const { data: statusData } = await supabase.rpc('check_fanart_status', { p_ids: pendingIds });
        if (statusData) {
          statusData.forEach((row) => {
            survivingPendingMap.set(row.id, row.is_approved);
            statusMap[row.id] = row.is_approved ? 'approved' : 'pending';
          });
        }
      }

      // Purge rejected fanart
      const cleanedLocal = localFan.filter(
        (item) => approvedMap.has(item.id) || survivingPendingMap.has(item.id)
      );

      if (cleanedLocal.length !== localFan.length) {
        localStorage.setItem('poke_my_fanart_submissions', JSON.stringify(cleanedLocal));
      }

      const mergedMap = new Map();
      approvedMap.forEach((val, key) => mergedMap.set(key, val));
      cleanedLocal.forEach((val) => {
        if (!mergedMap.has(val.id)) {
          const isApprovedInDb = survivingPendingMap.get(val.id) === true;
          mergedMap.set(val.id, { ...val, is_approved: isApprovedInDb });
        }
      });

      setFanartSubmissions(Array.from(mergedMap.values()));
      setFanartStatusMap(statusMap);
    } catch (err) {
      console.error('Error syncing fanart:', err);
    }
  }

  function handleSwitchArtist(newArtist) {
    setActiveArtist(newArtist);
    localStorage.setItem('poke_active_artist', newArtist);
    syncAll(newArtist, pokemonSubmissions, fanartSubmissions);
  }

  async function handleRetractPokemon(item, e) {
    if (e) e.stopPropagation();

    const confirmDelete = window.confirm(
      `Retract "${item.pokemon_name}"?\n\nThis will remove your submission from review and reset your cooldown timer!`
    );
    if (!confirmDelete) return;

    try {
      const { data: fileName, error: dbError } = await supabase.rpc('delete_my_submission', {
        target_id: item.id,
        token: item.delete_token
      });

      if (dbError) throw dbError;

      if (fileName) {
        await supabase.storage.from('drawings').remove([fileName]);
      } else {
        const urlParts = item.image_url.split('/');
        const fallbackName = urlParts[urlParts.length - 1];
        if (fallbackName) await supabase.storage.from('drawings').remove([fallbackName]);
      }

      const updated = pokemonSubmissions.filter((d) => d.id !== item.id);
      localStorage.setItem('poke_my_submissions', JSON.stringify(updated));
      setPokemonSubmissions(updated);

      if (selectedArtwork?.id === item.id) setSelectedArtwork(null);
      localStorage.removeItem(COOLDOWN_KEY);

      alert('Submission retracted!');
    } catch (err) {
      alert('Could not retract: ' + err.message);
    }
  }

  async function handleRetractFanart(item, e) {
    if (e) e.stopPropagation();

    const confirmDelete = window.confirm(
      `Delete fanart "${item.title}"?\n\nThis will remove your submission!`
    );
    if (!confirmDelete) return;

    try {
      const { data: fileName, error: dbError } = await supabase.rpc('delete_my_fanart', {
        target_id: item.id,
        token: item.delete_token
      });

      if (dbError) throw dbError;

      if (fileName) {
        await supabase.storage.from('drawings').remove([fileName]);
      }

      const updated = fanartSubmissions.filter((d) => d.id !== item.id);
      localStorage.setItem('poke_my_fanart_submissions', JSON.stringify(updated));
      setFanartSubmissions(updated);

      if (selectedArtwork?.id === item.id) setSelectedArtwork(null);
      alert('Fanart deleted.');
    } catch (err) {
      alert('Could not delete fanart: ' + err.message);
    }
  }

  function copyMyMuseumLink() {
    if (!activeArtist) return;
    const url = `${window.location.origin}/artist/${encodeURIComponent(activeArtist)}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const isPokemonTab = activeTab === 'pokemon';
  const rawList = isPokemonTab ? pokemonSubmissions : fanartSubmissions;
  const statusMap = isPokemonTab ? pokemonStatusMap : fanartStatusMap;

  const currentList = rawList.filter((item) => {
    if (!activeArtist) return true;
    return item.artist_name.toLowerCase().trim() === activeArtist.toLowerCase().trim();
  });

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
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        
        {/* Header Banner */}
        <header style={{
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(8px)',
          padding: '18px 24px',
          borderRadius: '12px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
          marginBottom: '18px',
          color: '#111',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '24px', color: '#000', fontWeight: 'bold' }}>
                {activeArtist ? `${activeArtist}'s Creations` : 'My Submissions'}
              </h1>

              {savedHandles.length > 1 && (
                <select
                  value={activeArtist}
                  onChange={(e) => handleSwitchArtist(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1.5px solid #000',
                    background: '#fff',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  {savedHandles.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              )}
            </div>

            <p style={{ margin: '4px 0 0 0', color: '#333', fontSize: '14px' }}>
              {activeArtist 
                ? `Showing drawings created by "${activeArtist}".` 
                : 'Manage and view your submissions.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {activeArtist && (
              <button
                onClick={copyMyMuseumLink}
                style={{
                  background: copied ? '#2e7d32' : '#f0f0f0',
                  color: copied ? '#fff' : '#111',
                  border: '1.5px solid #000',
                  padding: '9px 15px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {copied ? 'Link Copied' : 'Share My Museum'}
              </button>
            )}

            <Link to={isPokemonTab ? "/submit" : "/fanart"}>
              <button style={{
                background: '#ff9800',
                color: '#000',
                border: '1.5px solid #000',
                padding: '9px 16px',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: 'pointer'
              }}>
                {isPokemonTab ? "Submit Drawing" : "Submit Fanart"}
              </button>
            </Link>
          </div>
        </header>

        {/* Streamlined Unified Control Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px'
        }}>
          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('pokemon')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: 'pointer',
                border: isPokemonTab ? '1.5px solid #000' : '1px solid #ccc',
                background: isPokemonTab ? '#ff9800' : '#ffffff',
                color: isPokemonTab ? '#000' : '#444',
                boxShadow: isPokemonTab ? '0 2px 6px rgba(0,0,0,0.15)' : 'none'
              }}
            >
              Pokémon Drawings ({pokemonSubmissions.length})
            </button>

            <button
              onClick={() => setActiveTab('fanart')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: 'pointer',
                border: !isPokemonTab ? '1.5px solid #000' : '1px solid #ccc',
                background: !isPokemonTab ? '#ff9800' : '#ffffff',
                color: !isPokemonTab ? '#000' : '#444',
                boxShadow: !isPokemonTab ? '0 2px 6px rgba(0,0,0,0.15)' : 'none'
              }}
            >
              My Fanart ({fanartSubmissions.length})
            </button>
          </div>

          {/* Compact Showcase / Manage Switcher */}
          {currentList.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(255, 255, 255, 0.96)',
              padding: '4px 10px',
              borderRadius: '8px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
              border: '1px solid #ddd'
            }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setViewMode('showcase')}
                  style={{
                    background: viewMode === 'showcase' ? '#ff9800' : 'transparent',
                    color: viewMode === 'showcase' ? '#000' : '#555',
                    border: 'none',
                    padding: '5px 10px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '12px'
                  }}
                >
                  Showcase
                </button>
                <button
                  onClick={() => setViewMode('manage')}
                  style={{
                    background: viewMode === 'manage' ? '#ff9800' : 'transparent',
                    color: viewMode === 'manage' ? '#000' : '#555',
                    border: 'none',
                    padding: '5px 10px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '12px'
                  }}
                >
                  Manage
                </button>
              </div>

              <span style={{ fontSize: '12px', color: '#666', borderLeft: '1px solid #ccc', paddingLeft: '8px' }}>
                {currentList.length} {currentList.length === 1 ? 'artwork' : 'artworks'}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <p style={{ color: '#fff', textAlign: 'center', padding: '40px', fontSize: '18px' }}>Syncing artwork...</p>
        ) : currentList.length === 0 ? (
          <div style={{
            padding: '50px 20px',
            textAlign: 'center',
            background: 'rgba(255, 255, 255, 0.96)',
            borderRadius: '12px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
            color: '#111'
          }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#000', fontSize: '20px' }}>
              {isPokemonTab 
                ? `No Pokémon drawings found for "${activeArtist}"!`
                : `No fanart found for "${activeArtist}"!`}
            </h3>
            <p style={{ color: '#444', marginBottom: '20px' }}>
              {isPokemonTab 
                ? 'Draw your favorite Pokémon and add it to the museum.' 
                : 'Submit your creative Pokémon fanart to the gallery.'}
            </p>
            <Link to={isPokemonTab ? "/submit" : "/fanart"}>
              <button style={{
                padding: '12px 24px',
                cursor: 'pointer',
                background: '#ff9800',
                color: '#000',
                border: '1.5px solid #000',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '14px'
              }}>
                {isPokemonTab ? "Submit a Drawing" : "Submit Fanart"}
              </button>
            </Link>
          </div>
        ) : viewMode === 'showcase' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '24px'
          }}>
            {currentList.map((item) => {
              const status = statusMap[item.id] || (item.is_approved ? 'approved' : 'pending');

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedArtwork(item)}
                  style={{
                    border: '1px solid #ccc',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    background: '#ffffff',
                    color: '#111',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
             {/* Image Container: Clean pure white, 0 padding, clips on hover */}
                      <div style={{ 
                        height: '240px', 
                        background: '#ffffff', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        padding: 0, 
                        overflow: 'hidden', 
                        position: 'relative' 
                      }}>
                        <AutoFitImage 
                          src={item.image_url} 
                          alt={item.pokemon_name} 
                        />
                      </div>
                      
                  <div style={{ padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#000', fontWeight: 'bold' }}>
                        {item.pokemon_name || item.title}
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px', color: '#444' }}>
                        By: <strong>{item.artist_name}</strong>
                      </p>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 'bold',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      background: status === 'approved' ? '#e8f5e9' : '#fff3e0',
                      color: status === 'approved' ? '#1b5e20' : '#bf360c',
                      border: `1px solid ${status === 'approved' ? '#c8e6c9' : '#ffe0b2'}`
                    }}>
                      {status === 'approved' ? 'Live' : 'Pending'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {currentList.map((item) => {
              const status = statusMap[item.id] || (item.is_approved ? 'approved' : 'pending');

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: '18px',
                    border: '1px solid #ccc',
                    borderRadius: '12px',
                    padding: '16px',
                    alignItems: 'center',
                    background: '#ffffff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    color: '#111',
                    flexWrap: 'wrap'
                  }}
                >
                  <img
                    src={item.image_url}
                    alt=""
                    style={{
                      width: '88px',
                      height: '88px',
                      objectFit: 'contain',
                      background: '#f2f4f7',
                      borderRadius: '8px',
                      padding: '4px',
                      border: '1px solid #e0e0e0'
                    }}
                  />

                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#000', fontWeight: 'bold' }}>
                      {item.pokemon_name || item.title}
                    </h3>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#333' }}>
                      Artist: <strong>{item.artist_name}</strong>
                    </p>

                    <span style={{
                      fontSize: '12px',
                      background: status === 'approved' ? '#e8f5e9' : '#fff3e0',
                      color: status === 'approved' ? '#1b5e20' : '#bf360c',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontWeight: 'bold',
                      display: 'inline-block',
                      border: `1px solid ${status === 'approved' ? '#c8e6c9' : '#ffe0b2'}`
                    }}>
                      {status === 'approved' ? 'Live in Museum' : 'Pending Admin Review'}
                    </span>
                  </div>

                  <button
                    onClick={(e) => isPokemonTab ? handleRetractPokemon(item, e) : handleRetractFanart(item, e)}
                    style={{
                      background: '#ffebee',
                      color: '#b71c1c',
                      border: '1.5px solid #ef4444',
                      padding: '10px 18px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      marginLeft: 'auto'
                    }}
                  >
                    Delete artwork
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Zoom Lightbox */}
        {selectedArtwork && (
          <div onClick={() => setSelectedArtwork(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '90vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ maxHeight: '75vh', background: '#0a0a0a', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
                <img src={selectedArtwork.image_url} alt="" style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{selectedArtwork.pokemon_name || selectedArtwork.title}</h2>
                  <p style={{ margin: '4px 0 0 0', color: '#444', fontSize: '14px' }}>
                    Drawn by: <strong>{selectedArtwork.artist_name}</strong>
                  </p>
                </div>
                <button onClick={() => setSelectedArtwork(null)} style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: '6px', border: '1.5px solid #ccc', background: '#f5f5f5', fontWeight: 'bold' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}