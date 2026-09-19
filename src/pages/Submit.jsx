import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import imageCompression from 'browser-image-compression';
import { useNavigate } from 'react-router-dom';
import pokedex from '../data/pokedex.json';

const COOLDOWN_KEY = 'poke_museum_last_submit';
const COOLDOWN_MS = 5 * 60 * 1000; // ⏱️ 5 Minutes
const HANDLES_KEY = 'poke_my_claimed_handles';

function getOrCreateDeviceId() {
  let id = localStorage.getItem('poke_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('poke_device_id', id);
  }
  return id;
}

export default function Submit() {
  const [artistName, setArtistName] = useState('');
  const [savedHandles, setSavedHandles] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedPokemon, setSelectedPokemon] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsAdmin(true);
    });

    const handles = JSON.parse(localStorage.getItem(HANDLES_KEY) || '[]');
    setSavedHandles(handles);

    const active = localStorage.getItem('poke_active_artist');
    if (active) setArtistName(active);
    else if (handles.length > 0) setArtistName(handles[0]);

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
    const timer = setInterval(checkCooldown, 15000);
    return () => clearInterval(timer);
  }, []);

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

  async function handleSubmit(e) {
    e.preventDefault();

    if (!isAdmin && cooldownRemaining > 0) {
      alert(`Please wait ${cooldownRemaining} more minute(s) before submitting another drawing.`);
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

      if (!isAdmin && artistName.trim().toLowerCase() === 'kavhan') {
        throw new Error('The artist name "Kavhan" is reserved exclusively for the instructor! Please use your own artist handle.');
      }

      const finalArtistName = (isAdmin && artistName.trim().toLowerCase() === 'kavhan')
        ? 'Kavhan'
        : artistName.trim();

      const deviceId = getOrCreateDeviceId();

      // Max 3 handles check
      if (!isAdmin) {
        const myHandles = JSON.parse(localStorage.getItem(HANDLES_KEY) || '[]');
        const isExistingOnDevice = myHandles.some((h) => h.toLowerCase() === finalArtistName.toLowerCase());

        if (!isExistingOnDevice && myHandles.length >= 3) {
          throw new Error(
            `You can only register up to 3 artist handles on this device! Your current handles: ${myHandles.join(', ')}`
          );
        }
      }

      setStatusMsg('Verifying artist handle...');

      const { data: isAuthorized, error: claimError } = await supabase.rpc('verify_or_claim_artist', {
        input_name: finalArtistName,
        input_device_id: deviceId
      });

      if (claimError) throw claimError;

      if (!isAuthorized) {
        throw new Error(`The artist name "${artistName}" was already claimed on another device! Please pick your own unique artist handle.`);
      }

      if (!isAdmin) {
        const myHandles = JSON.parse(localStorage.getItem(HANDLES_KEY) || '[]');
        if (!myHandles.some((h) => h.toLowerCase() === finalArtistName.toLowerCase())) {
          myHandles.push(finalArtistName);
          localStorage.setItem(HANDLES_KEY, JSON.stringify(myHandles));
        }
      }

      localStorage.setItem('poke_active_artist', finalArtistName);

      setStatusMsg('Checking image dimensions...');
      const { width, height } = await getImageDimensions(file);

      if (width < 16 || height < 16) throw new Error('Image is too small or invalid.');
      if (width > 8000 || height > 8000) throw new Error('Image dimensions are too huge (max 8000px per side).');

      const aspectRatio = width / height;
      if (aspectRatio < 0.12 || aspectRatio > 8.0) throw new Error('Image aspect ratio is too extreme (max 8:1 ratio).');

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
          artist_name: finalArtistName,
          pokemon_name: matched.name.english,
          image_url: publicUrl,
          is_approved: false,
          delete_token: deleteToken
        }]);

      if (dbErr) throw dbErr;

      // 💾 INSTANT VISUAL FEEDBACK: Save to device memory immediately!
      const stored = JSON.parse(localStorage.getItem('poke_my_submissions') || '[]');
      stored.unshift({
        id: submissionId,
        pokemon_name: matched.name.english,
        artist_name: finalArtistName,
        image_url: publicUrl,
        delete_token: deleteToken,
        is_approved: false,
        created_at: new Date().toISOString()
      });
      localStorage.setItem('poke_my_submissions', JSON.stringify(stored));

      if (!isAdmin) {
        localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
      }

      alert(`Drawing of ${matched.name.english} submitted! Taking you to your submissions.`);
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
      <div style={{
        width: '100%',
        maxWidth: '520px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(8px)',
        borderRadius: '12px',
        padding: '30px',
        boxShadow: '0 12px 35px rgba(0,0,0,0.2)'
      }}>
        <h2 style={{ marginTop: 0, color: '#000', fontSize: '22px' }}>Submit Your Pokémon Drawing</h2>

        {isAdmin && (
          <div style={{ padding: '8px 12px', background: '#e8f5e9', color: '#1b5e20', borderRadius: '4px', marginBottom: '16px', fontSize: '13px', fontWeight: 'bold', border: '1px solid #c8e6c9' }}>
            👑 Admin Mode: Cooldown bypassed.
          </div>
        )}

        {!isAdmin && cooldownRemaining > 0 ? (
          <div style={{ padding: '15px', background: '#ffebee', color: '#b71c1c', borderRadius: '6px', border: '1px solid #ffcdd2' }}>
            ⏳ Cooldown active: You can submit another drawing in <strong>{cooldownRemaining} minute(s)</strong>.
            <br /><br />
            <small>Did you upload the wrong file? Go to <strong>My Submissions</strong> to retract it and reset your timer immediately.</small>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontWeight: 'bold', color: '#111' }}>
                  Artist Name / Handle (Max 3 per device):
                </label>
                {savedHandles.length > 0 && (
                  <select
                    onChange={(e) => {
                      if (e.target.value) setArtistName(e.target.value);
                    }}
                    value=""
                    style={{ fontSize: '12px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer' }}
                  >
                    <option value="">Choose saved handle...</option>
                    {savedHandles.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                )}
              </div>

              <input
                type="text"
                maxLength={30}
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                placeholder="e.g. Makkeroni"
                required
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '6px', border: '1.5px solid #ccc' }}
              />
              <small style={{ color: '#555', marginTop: '4px', display: 'block' }}>
                Your handle is locked to this device so nobody can impersonate you.
              </small>
            </div>

            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', color: '#111' }}>
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
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '6px', border: '1.5px solid #ccc' }}
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
                  boxShadow: '0 6px 12px rgba(0,0,0,0.15)'
                }}>
                  {filteredSuggestions.map((p) => (
                    <li
                      key={p.id}
                      onClick={() => {
                        setSelectedPokemon(p);
                        setQuery(`${p.name.english} (#${p.id})`);
                      }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #eee', color: '#111' }}
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
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', color: '#111' }}>
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
                padding: '13px',
                backgroundColor: uploading ? '#888' : '#22c55e',
                color: '#000',
                border: '1.5px solid #000',
                borderRadius: '6px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '16px',
                boxShadow: '0 3px 8px rgba(0,0,0,0.25)'
              }}
            >
              {uploading ? statusMsg || 'Processing...' : 'Submit to Museum 🎨'}
            </button>
          </form>
        )}
      </div>

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
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.45')}
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