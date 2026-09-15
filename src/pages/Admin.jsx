import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Admin() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingList, setPendingList] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchPending();
    });
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      fetchPending();
    }
  }

  async function fetchPending() {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('is_approved', false)
      .order('created_at', { ascending: false });

    if (error) console.error(error);
    else setPendingList(data || []);
  }

  async function approve(id) {
    await supabase.from('submissions').update({ is_approved: true }).eq('id', id);
    setPendingList(pendingList.filter(item => item.id !== id));
  }

 async function reject(item) {
  if (!confirm(`Are you sure you want to delete ${item.pokemon_name} by ${item.artist_name}?`)) return;

  try {
    // 1. Extract the file name from the public URL
    // URL looks like: .../storage/v1/object/public/drawings/1715000-pikachu.webp
    const urlParts = item.image_url.split('/');
    const fileName = urlParts[urlParts.length - 1];

    // 2. Delete the actual file from Supabase Storage
    if (fileName) {
      await supabase.storage.from('drawings').remove([fileName]);
    }

    // 3. Delete the row from the database
    await supabase.from('submissions').delete().eq('id', item.id);

    // 4. Update the admin UI list
    setPendingList(pendingList.filter(submission => submission.id !== item.id));
  } catch (err) {
    console.error('Failed to completely reject submission:', err);
    alert('Error rejecting: ' + err.message);
  }
}

  if (!session) {
    return (
      <div style={{ maxWidth: '400px', margin: '40px auto', padding: '20px' }}>
        <h2>Admin Login</h2>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          <button type="submit">Log In</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Pending Submissions Queue ({pendingList.length})</h2>
      <button onClick={() => supabase.auth.signOut().then(() => setSession(null))}>Log Out</button>

      {pendingList.length === 0 ? (
        <p>No drawings pending moderation!</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
          {pendingList.map(item => (
            <div key={item.id} style={{ display: 'flex', gap: '15px', border: '1px solid #ddd', padding: '10px' }}>
              <img src={item.image_url} alt="" style={{ width: '120px', height: '120px', objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <h3>{item.pokemon_name}</h3>
                <p>Artist: {item.artist_name}</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => approve(item.id)} style={{ background: 'green', color: 'white', padding: '6px 12px', cursor: 'pointer' }}>
                    Approve ✅
                  </button>
                    <button onClick={() => reject(item)} style={{ background: 'red', color: 'white', padding: '6px 12px', cursor: 'pointer' }}>
                    Reject ❌
                    </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}