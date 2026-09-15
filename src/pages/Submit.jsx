import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import imageCompression from 'browser-image-compression';
import { useNavigate } from 'react-router-dom';
import pokedex from '../data/pokedex.json';

const COOLDOWN_KEY = 'poke_museum_last_submit';
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export default function Submit() {
  const [artistName, setArtistName] = useState('');
  const [query, setQuery] = useState('');
  const [selectedPokemon, setSelectedPokemon] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  const navigate = useNavigate();

  // 1. Check Admin login status & 1-hour cooldown
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsAdmin(true);
      }
    });

    const checkCooldown = () => {
      const lastSubmit = localStorage.getItem(COOLDOWN_KEY);
      if (lastSubmit) {
        const diff = Date.now() - parseInt(lastSubmit, 10);
        if (diff < COOLDOWN_MS) {
          setCooldownRemaining(Math.ceil((COOLDOWN_MS - diff) / (60 * 1000)));
          return;
        }
      }
      setCooldownRemaining(0);
    };

    checkCooldown();
    const timer = setInterval(checkCooldown, 30000);
    return () => clearInterval(timer);
  }, []);

  // 2. Multilingual Pokemon Search Autocomplete
  const filteredSuggestions = useMemo(() => {
    if (!query.trim() || selectedPokemon) return [];
    const q = query.toLowerCase().trim();
    return pokedex
      .filter((p) =>
        p.name.english.toLowerCase().includes(q) ||
        (p.name.french && p.name.french.toLowerCase().includes(q)) ||
        p.name.japanese.includes(q) ||
        p.name.chinese.includes(q)
      )
      .slice(0, 6);
  }, [query, selectedPokemon]);

  // 3. Helper to read image dimensions
  function getImageDimensions(fileObj) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(fileObj);
      img.onload = () => {
        const dims = { width: img.naturalWidth, height: img.naturalHeight };
        URL.revokeObjectURL(img.src);
        resolve(dims);
      };
      img.onerror = () => reject(new Error('Invalid image file'));
    });
  }

  // 4. Form submission handler
  async function handleSubmit(e) {
    e.preventDefault();

    if (!isAdmin && cooldownRemaining > 0) {
      alert(`Please wait ${cooldownRemaining} more minutes before submitting another drawing.`);
      return;
    }

    const matched = selectedPokemon || pokedex.find(
      (p) =>
        p.name.english.toLowerCase() === query.trim().toLowerCase() ||
        (p.name.french && p.name.french.toLowerCase() === query.trim().toLowerCase()) ||
        p.name.japanese === query.trim() ||
        p.name.chinese === query.trim()
    );

    if (!matched) {
      alert('Please select a valid Pokémon from the list!');
      return;
    }

    if (!file) {
      alert('Please upload an image!');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      alert('File is too large! Maximum raw upload size is 15 MB.');
      return;
    }

    try {
      setUploading(true);
      setStatusMsg('Checking image dimensions...');

      const { width, height } = await getImageDimensions(file);

      if (width < 16 || height < 16) {
        throw new Error('Image is too small or invalid.');
      }

      if (width > 8000 || height > 8000) {
        throw new Error('Image dimensions are too huge (max 8000px per side).');
      }

      const aspectRatio = width / height;
      if (aspectRatio < 0.12 || aspectRatio > 8.0) {
        throw new Error('Image aspect ratio is too extreme (max 8:1 ratio).');
      }

      setStatusMsg('Optimizing & compressing image...');
      const options = {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
        fileType: 'image/webp'
      };
      const compressedBlob = await imageCompression(file, options);

      setStatusMsg('Uploading artwork...');
      const safePokemonName = matched.name.english.toLowerCase().replace(/[^a-z0-9]/g, '');
      const fileName = `${Date.now()}-${safePokemonName}.webp`;

      const { error: storageErr } = await supabase
        .storage
        .from('drawings')
        .upload(fileName, compressedBlob, {
          contentType: 'image/webp',
          upsert: false
        });

      if (storageErr) throw storageErr;

      const { data: { publicUrl } } = supabase
        .storage
        .from('drawings')
        .getPublicUrl(fileName);

      setStatusMsg('Registering submission...');

      const submissionId = crypto.randomUUID();
      const deleteToken = crypto.randomUUID();

      const { error: dbErr } = await supabase
        .from('submissions')
        .insert([{
          id: submissionId,
          artist_name: artistName.trim(),
          pokemon_name: matched.name.english,
          image_url: publicUrl,
          is_approved: false,
          delete_token: deleteToken
        }]);

      if (dbErr) throw dbErr;

      const stored = JSON.parse(localStorage.getItem('poke_my_submissions') || '[]');
      stored.unshift({
        id: submissionId,
        pokemon_name: matched.name.english,
        artist_name: artistName.trim(),
        image_url: publicUrl,
        delete_token: deleteToken,
        created_at: new Date().toISOString()
      });
      localStorage.setItem('poke_my_submissions', JSON.stringify(stored));

      if (!isAdmin) {
        localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
      }

      alert(`Drawing of ${matched.name.english} submitted! You can view or retract it under "My Submissions".`);
      navigate('/my-submissions');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Submission error');
    } finally {
      setUploading(false);
      setStatusMsg('');
    }
  }

  return (
    <div style={{
      position: 'relative',
      flex: 1, 
      minHeight: 'calc(100dvh - 54px)', 
      width: '100%',
      backgroundImage: 'url(/submit_bg.webp)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      padding: '40px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'sans-serif',
      boxSizing: 'border-box'
    }}>
      {/* Semi-transparent Frosted Card */}
      <div style={{
        width: '100%',
        maxWidth: '520px',
        backgroundColor: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(8px)',
        borderRadius: '12px',
        padding: '30px',
        boxShadow: '0 12px 35px rgba(0,0,0,0.18)'
      }}>
        <h2 style={{ marginTop: 0, color: '#222' }}>Submit Your Pokémon Drawing</h2>

        {isAdmin && (
          <div style={{ padding: '8px 12px', background: '#e8f5e9', color: '#2e7d32', borderRadius: '4px', marginBottom: '16px', fontSize: '14px', fontWeight: 'bold' }}>
            👑 Admin Mode: Cooldown bypassed. Submit as much as you like!
          </div>
        )}

        {!isAdmin && cooldownRemaining > 0 ? (
          <div style={{ padding: '15px', background: '#ffebee', color: '#c62828', borderRadius: '6px' }}>
            ⏳ Cooldown active: You can submit another drawing in <strong>{cooldownRemaining} minutes</strong>.
            <br /><br />
            <small>Did you upload the wrong file? Go to <strong>My Submissions</strong> to retract it and reset your timer immediately.</small>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', color: '#333' }}>
                Artist Name / Handle:
              </label>
              <input
                type="text"
                maxLength={30}
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                placeholder="e.g. AshKetchum"
                required
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', color: '#333' }}>
                Pokémon Drawn:
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedPokemon(null);
                }}
                placeholder="Search Pokémon name..."
                required
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc' }}
              />

              {filteredSuggestions.length > 0 && (
                <ul style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#fff',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  listStyle: 'none',
                  margin: '4px 0 0 0',
                  padding: 0,
                  zIndex: 10,
                  boxShadow: '0 6px 12px rgba(0,0,0,0.1)'
                }}>
                  {filteredSuggestions.map((p) => (
                    <li
                      key={p.id}
                      onClick={() => {
                        setSelectedPokemon(p);
                        setQuery(`${p.name.english} (#${p.id})`);
                      }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                      onMouseEnter={(e) => (e.target.style.background = '#f2f2f2')}
                      onMouseLeave={(e) => (e.target.style.background = '#fff')}
                    >
                      #{p.id} <strong>{p.name.english}</strong> {p.name.japanese ? `(${p.name.japanese})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', color: '#333' }}>
                Drawing (PNG, JPG, WebP — Max 8:1 comic ratio):
              </label>
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
                backgroundColor: uploading ? '#888' : '#0070f3',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '15px'
              }}
            >
              {uploading ? statusMsg || 'Processing...' : 'Submit to Museum'}
            </button>
          </form>
        )}
      </div>

      {/* 🔍 Subtle, Non-Intrusive Background Credit in the Bottom Corner */}
      <div style={{
        position: 'absolute',
        bottom: '8px',
        right: '12px',
        fontSize: '11px',
        color: '#ffffff',
        opacity: 0.45,
        transition: 'opacity 0.2s ease',
        textShadow: '0 1px 2px rgba(0,0,0,0.75)'
      }}
      onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.45'}
      >
        credit for the background goes to{' '}
        <a 
          href="https://www.reddit.com/r/wallpapers/comments/12xf50o/i_made_a_pokemon_koi_pond_wallpaper_3840_x_2160/" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#fff', textDecoration: 'underline' }}
        >
          CarolynDesign
        </a>
      </div>
    </div>
  );
}