import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

const COOLDOWN_KEY = 'poke_museum_last_submit';

export default function MySubmissions() {
  const [myList, setMyList] = useState([]);
  const [statusMap, setStatusMap] = useState({}); // Tracks if admin approved/deleted it

  useEffect(() => {
    loadMySubmissions();
  }, []);

  async function loadMySubmissions() {
    const local = JSON.parse(localStorage.getItem('poke_my_submissions') || '[]');
    setMyList(local);

    if (local.length === 0) return;

    // Check live status of their submissions
    const ids = local.map((item) => item.id);
    const { data } = await supabase
      .from('submissions')
      .select('id, is_approved')
      .in('id', ids);

    if (data) {
      const map = {};
      data.forEach((row) => {
        map[row.id] = row.is_approved ? 'approved' : 'pending';
      });
      setStatusMap(map);
    }
  }

  async function handleRetract(item) {
    const confirmDelete = window.confirm(
      `Retract "${item.pokemon_name}"?\n\nThis will remove your submission from review and immediately reset your 1-hour cooldown timer so you can submit again!`
    );
    if (!confirmDelete) return;

    try {
      // 1. Call the function to delete the database row (returns the filename)
      const { data: fileName, error: dbError } = await supabase.rpc('delete_my_submission', {
        target_id: item.id,
        token: item.delete_token
      });

      if (dbError) throw dbError;
      if (!fileName) throw new Error('Unauthorized or this submission was already removed.');

      // 2. Delete the actual file using the official Storage API
      await supabase.storage.from('drawings').remove([fileName]);

      // 3. Remove from localStorage
      const updated = myList.filter((d) => d.id !== item.id);
      localStorage.setItem('poke_my_submissions', JSON.stringify(updated));
      setMyList(updated);

      // 4. ⏱️ Reset cooldown timer
      localStorage.removeItem(COOLDOWN_KEY);

      alert('Submission retracted! Your cooldown has been reset. You can submit again now.');
    } catch (err) {
      console.error(err);
      alert('Could not retract submission: ' + err.message);
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '30px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>My Submissions</h2>
      <p style={{ color: '#666' }}>
        Drawings submitted from this browser. You can cancel or retract any drawing before or after review.
      </p>

      {myList.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', background: '#f9f9f9', borderRadius: '8px' }}>
          <p>You haven't submitted any drawings yet!</p>
          <Link to="/submit">
            <button style={{ padding: '10px 20px', cursor: 'pointer' }}>Submit Art</button>
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {myList.map((item) => {
            const status = statusMap[item.id] || 'pending';

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  gap: '16px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '12px',
                  alignItems: 'center',
                  background: '#fff'
                }}
              >
                <img
                  src={item.image_url}
                  alt={item.pokemon_name}
                  style={{ width: '80px', height: '80px', objectFit: 'contain', background: '#f5f5f5', borderRadius: '6px' }}
                />

                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 4px 0' }}>{item.pokemon_name}</h3>
                  <p style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#666' }}>
                    Artist: {item.artist_name}
                  </p>

                  {/* Status Badge */}
                  {status === 'approved' ? (
                    <span style={{ fontSize: '13px', background: '#e8f5e9', color: '#2e7d32', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                      ✅ Live in Museum
                    </span>
                  ) : (
                    <span style={{ fontSize: '13px', background: '#fff3e0', color: '#e65100', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                      ⏳ Pending Admin Review
                    </span>
                  )}
                </div>

                {/* Retract / Delete Button */}
                <button
                  onClick={() => handleRetract(item)}
                  style={{
                    background: '#ffebee',
                    color: '#c62828',
                    border: '1px solid #ffcdd2',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Retract & Reset Cooldown ↺
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}