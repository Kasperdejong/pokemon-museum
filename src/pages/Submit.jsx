import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import imageCompression from 'browser-image-compression';
import { useNavigate, useSearchParams } from 'react-router-dom';
import pokedex from '../data/pokédex.json';

function parsePokeId(rawId) {
  if (!rawId) return null;
  const cleaned = String(rawId).replace(/[^0-9]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

const COOLDOWN_KEY = 'poke_museum_last_submit';
const COOLDOWN_MS = 3 * 60 * 1000;
const HANDLES_KEY = 'poke_my_claimed_handles';

const BANNED_PATTERNS = [
  /penis/i, /cock/i, /dick/i, /vagina/i, /pussy/i, /nigger/i, /faggot/i, /hitler/i,
  /nazi/i, /porn/i, /sex/i, /tits/i, /boobs/i, /retard/i, /cunt/i, /whore/i, /slut/i,
  /\.com/i, /\.net/i, /\.org/i, /\.gg/i, /https?:\/\//i
];

function isForbiddenHandle(name) {
  return BANNED_PATTERNS.some((pattern) => pattern.test(name));
}

function getOrCreateDeviceId() {
  let id = localStorage.getItem('poke_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('poke_device_id', id);
  }
  return id;
}

export default function Submit() {
  const [searchParams] = useSearchParams();
  const prefillPokemon = searchParams.get('pokemon');

  const [artistName, setArtistName] = useState('');
  const [savedHandles, setSavedHandles] = useState([]);
  const [query, setQuery] = useState(prefillPokemon || '');
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

    if (prefillPokemon) {
      const num = parsePokeId(prefillPokemon);
      const found = pokedex.find((p) => 
        (num !== null && parsePokeId(p.id) === num) ||
        p.name?.english?.toLowerCase() === prefillPokemon.toLowerCase()
      );
      if (found) {
        setSelectedPokemon(found);
        setQuery(`${found.name.english} (#${parsePokeId(found.id)})`);
      }
    }

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
  }, [prefillPokemon]);

  // 🔍 Suggestions: Matches names or numbers (e.g. 181, 25)
  const filteredSuggestions = useMemo(() => {
    if (!query.trim() || selectedPokemon) return [];
    const q = query.toLowerCase().trim();
    const isOnlyDigits = /^#?\d+$/.test(q);
    const searchNumber = parsePokeId(q);

    return pokedex
      .filter((p) => {
        const pNum = parsePokeId(p.id);

        if (isOnlyDigits && searchNumber !== null && pNum !== null) {
          return pNum === searchNumber || String(pNum).startsWith(String(searchNumber));
        }

        return (
          p.name?.english?.toLowerCase().includes(q) ||
          (p.name?.japanese && p.name.japanese.includes(q))
        );
      })
      .sort((a, b) => {
        if (searchNumber !== null) {
          const aNum = parsePokeId(a.id);
          const bNum = parsePokeId(b.id);
          if (aNum === searchNumber) return -1;
          if (bNum === searchNumber) return 1;
          return aNum - bNum;
        }
        return 0;
      })
      .slice(0, 6);
  }, [query, selectedPokemon]);

  // Helper: Finds the bounding box of non-transparent pixels and crops away empty space
async function autoTrimTransparentImage(file) {
  // Only process PNG or WebP images that support transparency
  if (!['image/png', 'image/webp'].includes(file.type)) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = 0;
        let maxY = 0;
        let foundPixel = false;

        // Scan pixels for non-transparent content (alpha > 15)
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const alpha = data[(y * canvas.width + x) * 4 + 3];
            if (alpha > 15) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              foundPixel = true;
            }
          }
        }

        // If the image is fully opaque (like a solid background) or empty, keep original
        if (!foundPixel || (minX === 0 && minY === 0 && maxX === canvas.width - 1 && maxY === canvas.height - 1)) {
          resolve(file);
          return;
        }

        // Add a 3% breathing margin so it doesn't touch the edge
        const pad = Math.round(Math.max(canvas.width, canvas.height) * 0.03);
        const cropX = Math.max(0, minX - pad);
        const cropY = Math.max(0, minY - pad);
        const cropW = Math.min(canvas.width - cropX, (maxX - minX) + pad * 2);
        const cropH = Math.min(canvas.height - cropY, (maxY - minY) + pad * 2);

        const trimmedCanvas = document.createElement('canvas');
        trimmedCanvas.width = cropW;
        trimmedCanvas.height = cropH;
        const trimmedCtx = trimmedCanvas.getContext('2d');
        trimmedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        trimmedCanvas.toBlob((blob) => {
          if (blob) {
            const trimmedFile = new File([blob], file.name, { type: 'image/png' });
            resolve(trimmedFile);
          } else {
            resolve(file);
          }
        }, 'image/png');
      } catch (err) {
        // Fallback to original if canvas reading fails
        console.warn('Auto-trim skipped:', err);
        resolve(file);
      }
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

  async function handleSubmit(e) {
    e.preventDefault();

    if (!isAdmin && cooldownRemaining > 0) {
      alert(`Please wait ${cooldownRemaining} more minute(s) before submitting another drawing.`);
      return;
    }

    // 1. Auto-trim empty transparent edges so the drawing is big and centered!
      setStatusMsg('Auto-framing drawing...');
      const trimmedFile = await autoTrimTransparentImage(file);

      // 2. Compress image to WebP
      setStatusMsg('Compressing image to WebP...');
      const options = {
        maxSizeMB: 0.25,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
        fileType: 'image/webp'
      };
      const compressedBlob = await imageCompression(trimmedFile, options);

    const queryTrimmed = query.trim();
    const queryNum = parsePokeId(queryTrimmed);

    const matched = selectedPokemon || pokedex.find((p) => {
      const pNum = parsePokeId(p.id);
      return (
        (queryNum !== null && pNum === queryNum) ||
        p.name?.english?.toLowerCase() === queryTrimmed.toLowerCase() ||
        (p.name?.japanese && p.name.japanese === queryTrimmed)
      );
    });

    if (!matched) {
      alert('Please select a valid Pokémon name or #ID from the list!');
      return;
    }

    if (!file) {
      alert('Please upload an image!');
      return;
    }

    const cleanArtistName = artistName.trim();

    if (isForbiddenHandle(cleanArtistName)) {
      alert('Inappropriate or invalid artist handle. Please choose a family-friendly handle without links.');
      return;
    }

    try {
      setUploading(true);

      if (!isAdmin && cleanArtistName.toLowerCase() === 'kavhan') {
        throw new Error('The artist name "Kavhan" is reserved exclusively for the instructor!');
      }

      const finalArtistName = (isAdmin && cleanArtistName.toLowerCase() === 'kavhan')
        ? 'Kavhan'
        : cleanArtistName;

      const deviceId = getOrCreateDeviceId();

      if (!isAdmin) {
        const myHandles = JSON.parse(localStorage.getItem(HANDLES_KEY) || '[]');
        const isExistingOnDevice = myHandles.some((h) => h.toLowerCase() === finalArtistName.toLowerCase());

        if (!isExistingOnDevice && myHandles.length >= 3) {
          throw new Error(`You can only register up to 3 artist handles on this device! Current: ${myHandles.join(', ')}`);
        }
      }

      setStatusMsg('Verifying artist handle...');

      const { data: isAuthorized, error: claimError } = await supabase.rpc('verify_or_claim_artist', {
        input_name: finalArtistName,
        input_device_id: deviceId
      });

      if (claimError) throw claimError;

      if (!isAuthorized) {
        throw new Error(`The artist name "${artistName}" was already claimed on another device!`);
      }

      if (!isAdmin) {
        const myHandles = JSON.parse(localStorage.getItem(HANDLES_KEY) || '[]');
        if (!myHandles.some((h) => h.toLowerCase() === finalArtistName.toLowerCase())) {
          myHandles.push(finalArtistName);
          localStorage.setItem(HANDLES_KEY, JSON.stringify(myHandles));
        }
      }

      localStorage.setItem('poke_active_artist', finalArtistName);

      setStatusMsg('Compressing image to WebP...');
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
          delete_token: deleteToken,
          device_id: deviceId
        }]);

      if (dbErr) throw dbErr;

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

      alert(`Drawing of #${parsePokeId(matched.id)} ${matched.name.english} submitted for review!`);
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
          <div style={{ padding: '8px 12px', background: '#e8f5e9', color: '#1b5e20', borderRadius: '4px', marginBottom: '16px', fontSize: '13px', fontWeight: 'bold' }}>
            👑 Admin Mode Active
          </div>
        )}

        {!isAdmin && cooldownRemaining > 0 ? (
          <div style={{ padding: '15px', background: '#ffebee', color: '#b71c1c', borderRadius: '6px', border: '1px solid #ffcdd2' }}>
            ⏳ Cooldown active: You can submit another drawing in <strong>{cooldownRemaining} minute(s)</strong>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontWeight: 'bold', color: '#111' }}>Artist Name / Handle:</label>
                {savedHandles.length > 0 && (
                  <select
                    onChange={(e) => { if (e.target.value) setArtistName(e.target.value); }}
                    value=""
                    style={{ fontSize: '12px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #ccc' }}
                  >
                    <option value="">Select saved handle...</option>
                    {savedHandles.map((h) => <option key={h} value={h}>{h}</option>)}
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
            </div>

            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', color: '#111' }}>
                Pokémon Drawn (Search Name or Number e.g. 472):
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedPokemon(null);
                }}
                placeholder="Search Pokémon name or number..."
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
                  {filteredSuggestions.map((p) => {
                    const cleanNum = parsePokeId(p.id);
                    return (
                      <li
                        key={p.id}
                        onClick={() => {
                          setSelectedPokemon(p);
                          setQuery(`${p.name.english} (#${cleanNum})`);
                        }}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #eee', color: '#111' }}
                      >
                        #{cleanNum} <strong>{p.name.english}</strong> {p.name?.japanese ? `(${p.name.japanese})` : ''}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', color: '#111' }}>
                Drawing (PNG, JPG, WebP):
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
                fontSize: '16px'
              }}
            >
              {uploading ? statusMsg || 'Processing...' : 'Submit to Museum 🎨'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}