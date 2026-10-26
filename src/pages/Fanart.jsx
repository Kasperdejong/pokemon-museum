import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import imageCompression from 'browser-image-compression';
import AutoFitImage from '../components/AutoFitImage';

const HANDLES_KEY = 'poke_my_claimed_handles';

const BANNED_PATTERNS = [
  /penis/i, /cock/i, /dick/i, /vagina/i, /pussy/i, /nigger/i, /faggot/i, /hitler/i,
  /nazi/i, /porn/i, /sex/i, /tits/i, /boobs/i, /retard/i, /cunt/i, /whore/i, /slut/i,
  /\.com/i, /\.net/i, /\.org/i, /\.gg/i, /https?:\/\//i
];

function sanitizeTextInput(str, maxLength = 100) {
  if (!str) return '';
  return str
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, maxLength);
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function getOrCreateDeviceId() {
  let id = localStorage.getItem('poke_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('poke_device_id', id);
  }
  return id;
}

export default function Fanart() {
  const navigate = useNavigate();

  const [artList, setArtList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Search, Filter & Pagination states
  const [titleSearch, setTitleSearch] = useState('');
  const [artistSearch, setArtistSearch] = useState('');
  const [sortBy, setSortBy] = useState('featured');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  // Submit modal state
  const [showModal, setShowModal] = useState(false);
  const [artistName, setArtistName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [savedHandles, setSavedHandles] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsAdmin(true);
    });

    const handles = JSON.parse(localStorage.getItem(HANDLES_KEY) || '[]');
    setSavedHandles(handles);
    const active = localStorage.getItem('poke_active_artist') || handles[0] || '';
    if (active) setArtistName(active);

    fetchFanart();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [titleSearch, artistSearch, sortBy, pageSize]);

  async function fetchFanart() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fanart_submissions')
        .select('*')
        .eq('is_approved', true)
        .order('created_at', { ascending: false });

      if (error) console.error(error);
      else setArtList(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Toggle Featured status (Admin only)
  async function toggleFeature(item, e) {
    if (e) e.stopPropagation();
    const updated = !item.is_featured;
    try {
      const { error } = await supabase
        .from('fanart_submissions')
        .update({ is_featured: updated })
        .eq('id', item.id);

      if (error) throw error;
      setArtList((prev) => prev.map((d) => d.id === item.id ? { ...d, is_featured: updated } : d));
    } catch (err) {
      alert('Failed to update featured status: ' + err.message);
    }
  }

  async function handleDelete(item, e) {
    if (e) e.stopPropagation();

    const confirmed = window.confirm(
      `Permanent Delete: Are you sure you want to remove "${item.title}" by "${item.artist_name}"?`
    );
    if (!confirmed) return;

    try {
      const urlParts = item.image_url.split('/');
      const fileName = urlParts[urlParts.length - 1];

      if (fileName) {
        await supabase.storage.from('drawings').remove([fileName]);
      }

      const { error } = await supabase.from('fanart_submissions').delete().eq('id', item.id);
      if (error) throw error;

      setArtList((prev) => prev.filter((d) => d.id !== item.id));
      if (selectedArtwork?.id === item.id) setSelectedArtwork(null);
      alert(`"${item.title}" removed.`);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  function handleArtistClick(artist, e) {
    if (e) e.stopPropagation();
    setArtistSearch(artist);
    if (selectedArtwork) setSelectedArtwork(null);
  }

  function clearAllFilters() {
    setTitleSearch('');
    setArtistSearch('');
  }

  const filteredArt = useMemo(() => {
    const tQuery = titleSearch.toLowerCase().trim();
    const aQuery = artistSearch.toLowerCase().trim();

    return artList
      .filter((item) => {
        const matchesTitle = !tQuery || (
          (item.title && item.title.toLowerCase().includes(tQuery)) ||
          (item.description && item.description.toLowerCase().includes(tQuery))
        );
        const matchesArtist = !aQuery || (
          item.artist_name && item.artist_name.toLowerCase().includes(aQuery)
        );
        return matchesTitle && matchesArtist;
      })
      .sort((a, b) => {
        if (sortBy === 'featured') {
          const featDiff = (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0);
          if (featDiff !== 0) return featDiff;
          return new Date(b.created_at) - new Date(a.created_at);
        }
        if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
        if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
        if (sortBy === 'title_az') return (a.title || '').localeCompare(b.title || '');
        if (sortBy === 'artist_az') return (a.artist_name || '').localeCompare(b.artist_name || '');
        return 0;
      });
  }, [artList, titleSearch, artistSearch, sortBy]);

  const totalPages = Math.ceil(filteredArt.length / pageSize) || 1;
  const paginatedArt = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredArt.slice(startIdx, startIdx + pageSize);
  }, [filteredArt, currentPage, pageSize]);

  const hasActiveFilters = titleSearch.trim() !== '' || artistSearch.trim() !== '';

  async function handleSubmit(e) {
    e.preventDefault();

    const cleanArtistName = sanitizeTextInput(artistName, 30);
    const cleanTitle = sanitizeTextInput(title, 50);
    const cleanDesc = sanitizeTextInput(description, 200);

    if (!cleanArtistName) {
      alert('Please enter a valid artist handle!');
      return;
    }
    if (!cleanTitle) {
      alert('Please enter a valid artwork title!');
      return;
    }
    if (!file) {
      alert('Please select an image file!');
      return;
    }

    if (BANNED_PATTERNS.some((p) => p.test(cleanArtistName) || p.test(cleanTitle) || p.test(cleanDesc))) {
      alert('Inappropriate text or links detected. Please keep titles and handles clean.');
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      alert('Only PNG, JPG, or WebP images are allowed.');
      return;
    }

    try {
      setUploading(true);
      const deviceId = getOrCreateDeviceId();

      setStatusMsg('Verifying artist handle...');
      const { data: isAuthorized, error: claimError } = await supabase.rpc('verify_or_claim_artist', {
        input_name: cleanArtistName,
        input_device_id: deviceId
      });

      if (claimError) throw claimError;
      if (!isAuthorized) {
        throw new Error(`The artist handle "${cleanArtistName}" was claimed on another device!`);
      }

      const myHandles = JSON.parse(localStorage.getItem(HANDLES_KEY) || '[]');
      if (!myHandles.some((h) => h.toLowerCase() === cleanArtistName.toLowerCase())) {
        myHandles.push(cleanArtistName);
        localStorage.setItem(HANDLES_KEY, JSON.stringify(myHandles));
      }
      localStorage.setItem('poke_active_artist', cleanArtistName);

      setStatusMsg('Compressing image...');
      const compressedBlob = await imageCompression(file, {
        maxSizeMB: 0.35,
        maxWidthOrHeight: 1400,
        useWebWorker: true,
        fileType: 'image/webp'
      });

      setStatusMsg('Uploading artwork...');
      const fileName = `fanart-${Date.now()}-${cleanArtistName.replace(/[^a-z0-9]/gi, '')}.webp`;
      const { error: storageErr } = await supabase.storage.from('drawings').upload(fileName, compressedBlob, {
        contentType: 'image/webp',
        upsert: false
      });
      if (storageErr) throw storageErr;

      const { data: { publicUrl } } = supabase.storage.from('drawings').getPublicUrl(fileName);

      const submissionId = crypto.randomUUID();
      const deleteToken = crypto.randomUUID();

      setStatusMsg('Submitting for moderation...');
      const { error: dbErr } = await supabase.from('fanart_submissions').insert([{
        id: submissionId,
        artist_name: cleanArtistName,
        title: cleanTitle,
        description: cleanDesc,
        image_url: publicUrl,
        is_approved: false,
        is_featured: false,
        delete_token: deleteToken,
        device_id: deviceId
      }]);

      if (dbErr) throw dbErr;

      const localFanart = JSON.parse(localStorage.getItem('poke_my_fanart_submissions') || '[]');
      localFanart.unshift({
        id: submissionId,
        title: cleanTitle,
        artist_name: cleanArtistName,
        description: cleanDesc,
        image_url: publicUrl,
        delete_token: deleteToken,
        is_approved: false,
        created_at: new Date().toISOString()
      });
      localStorage.setItem('poke_my_fanart_submissions', JSON.stringify(localFanart));

      alert('Fanart submitted for approval! An admin will review it shortly.');
      setShowModal(false);
      setTitle('');
      setDescription('');
      setFile(null);

      navigate('/my-submissions?tab=fanart');
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      setStatusMsg('');
    }
  }

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
        
        {/* Header Banner */}
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
                src="/Aegislash_shield.png" 
                alt="Aegislash Shield" 
                style={{ width: '42px', height: '42px', objectFit: 'contain' }} 
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <h1 style={{ margin: 0, fontSize: '26px', color: '#000', fontWeight: 'bold' }}>
                Community Fanart Gallery
              </h1>
            </div>
            <p style={{ margin: '6px 0 0 0', color: '#444', fontSize: '14px' }}>
              {artList.length} exhibited artworks &bull; Battles, trainer scenes, custom variants, and creative artwork.
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: '10px 18px',
              background: '#ff9800',
              color: '#000',
              border: '1.5px solid #000',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Submit Fanart
          </button>
        </header>

        {/* Filter & Search Bar */}
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
            placeholder="🔍 Search Artwork Title or Description..."
            value={titleSearch}
            onChange={(e) => setTitleSearch(e.target.value)}
            style={{ padding: '9px 14px', flex: '1', minWidth: '180px', borderRadius: '6px', border: '1.5px solid #ccc' }}
          />

          <input 
            type="text"
            placeholder="🎨 Search Artist..."
            value={artistSearch}
            onChange={(e) => setArtistSearch(e.target.value)}
            style={{ padding: '9px 14px', flex: '1', minWidth: '160px', borderRadius: '6px', border: '1.5px solid #ccc' }}
          />

          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: '9px 14px', borderRadius: '6px', border: '1.5px solid #ccc', cursor: 'pointer', fontWeight: '500' }}
          >
            <option value="featured">⭐ Featured First</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="title_az">Title (A–Z)</option>
            <option value="artist_az">Artist (A–Z)</option>
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
          <p style={{ color: '#fff', textAlign: 'center', padding: '40px', fontSize: '18px' }}>Loading fanart...</p>
        ) : filteredArt.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.96)', borderRadius: '12px' }}>
            <h2>No fanart found!</h2>
            {hasActiveFilters ? (
              <button
                onClick={clearAllFilters}
                style={{
                  marginTop: '12px',
                  padding: '10px 18px',
                  background: '#ff9800',
                  color: '#000',
                  border: '1.5px solid #000',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Clear Search
              </button>
            ) : (
              <>
                <p style={{ color: '#555', marginTop: '6px' }}>Be the first to submit a piece of fanart to the gallery!</p>
                <button
                  onClick={() => setShowModal(true)}
                  style={{
                    marginTop: '12px',
                    padding: '10px 18px',
                    background: '#ff9800',
                    color: '#000',
                    border: '1.5px solid #000',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  Submit Fanart
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="museum-grid">
              {paginatedArt.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedArtwork(item)}
                  style={{
                    background: '#ffffff',
                    borderRadius: '10px',
                    border: item.is_featured ? '2.5px solid #f59e0b' : '1px solid #ccc',
                    boxShadow: item.is_featured ? '0 0 16px rgba(245, 158, 11, 0.45)' : '0 4px 12px rgba(0,0,0,0.12)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    transition: 'transform 0.15s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {/* Featured Badge */}
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
                      boxShadow: '0 2px 4px rgba(0,0,0,0.25)'
                    }}>
                      ⭐ Featured
                    </div>
                  )}

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

                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', color: '#000', fontWeight: 'bold' }}>
                        {item.title}
                      </h3>
                      <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#444' }}>
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
                      {item.description && (
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#555', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Admin Actions: Yellow Star & Delete */}
                    {isAdmin && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                        <button
                          onClick={(e) => toggleFeature(item, e)}
                          title={item.is_featured ? 'Remove Featured' : 'Feature Artwork'}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: '20px',
                            cursor: 'pointer',
                            color: '#eab308',
                            lineHeight: 1,
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
                            padding: '3px 7px',
                            fontSize: '11px',
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
                margin: '35px auto 0 auto',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
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

        {/* Submit Modal */}
        {showModal && (
          <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '500px', padding: '24px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '20px' }}>Submit Community Fanart</h2>
                <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>Artist Handle:</label>
                  {savedHandles.length > 0 && (
                    <select
                      onChange={(e) => { if (e.target.value) setArtistName(e.target.value); }}
                      value=""
                      style={{ fontSize: '12px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc', marginBottom: '6px', width: '100%' }}
                    >
                      <option value="">Choose from your saved handles...</option>
                      {savedHandles.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  )}
                  <input
                    type="text"
                    maxLength={30}
                    value={artistName}
                    onChange={(e) => setArtistName(e.target.value)}
                    placeholder="Your artist handle"
                    required
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1.5px solid #ccc', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>Artwork Title (Max 50 chars):</label>
                  <input
                    type="text"
                    maxLength={50}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Cynthia's Garchomp"
                    required
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1.5px solid #ccc', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>Description (Max 200 chars, optional):</label>
                  <textarea
                    rows={2}
                    maxLength={200}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What tools or theme did you use?"
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1.5px solid #ccc', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>Image File (PNG, JPG, WebP):</label>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={(e) => setFile(e.target.files[0])}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={uploading}
                  style={{
                    padding: '12px',
                    background: uploading ? '#888' : '#ff9800',
                    color: '#000',
                    border: '1.5px solid #000',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    fontSize: '15px',
                    cursor: uploading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {uploading ? (statusMsg || 'Uploading...') : 'Submit Fanart for Review'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Lightbox Preview */}
        {selectedArtwork && (
          <div onClick={() => setSelectedArtwork(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '10px', maxWidth: '90vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ maxHeight: '75vh', background: '#111', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
                <img src={selectedArtwork.image_url} alt="" style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{selectedArtwork.title}</h2>
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
                  {selectedArtwork.description && (
                    <p style={{ margin: '4px 0 0 0', color: '#555', fontSize: '13px' }}>{selectedArtwork.description}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {isAdmin && (
                    <>
                      <button
                        onClick={(e) => toggleFeature(selectedArtwork, e)}
                        title={selectedArtwork.is_featured ? 'Remove Featured' : 'Feature Artwork'}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          fontSize: '22px',
                          cursor: 'pointer',
                          color: '#eab308',
                          lineHeight: 1
                        }}
                      >
                        {selectedArtwork.is_featured ? '★' : '☆'}
                      </button>

                      <button
                        onClick={(e) => handleDelete(selectedArtwork, e)}
                        style={{ padding: '8px 14px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #f87171', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        Delete 🗑️
                      </button>
                    </>
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