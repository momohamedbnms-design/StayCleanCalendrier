import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://lsazoxunvvdqcqhxkgvt.supabase.co',
  'sb_publishable_r-RndrvLSwM0kFZr0sCT5w_k55euBI2'
);

/* Mappe l'heure GHL vers le créneau de l'app */
function getSlot(startTime) {
  if (!startTime) return 'matin';
  const hour = new Date(startTime).getHours();
  if (hour < 13) return 'matin';
  if (hour < 15) return 'midi';
  return 'soir';
}

/* Formate la date en YYYY-MM-DD */
function getDateStr(startTime) {
  if (!startTime) return new Date().toISOString().split('T')[0];
  return new Date(startTime).toISOString().split('T')[0];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;
    console.log('GHL Webhook reçu:', JSON.stringify(data));

    /* Extrait les infos du webhook GHL */
    const name        = data.contact_name || data.full_name || data.firstName || 'Client';
    const phone       = data.phone || data.contact_phone || '';
    const address     = data.address || data.contact_address || '';
    const startTime   = data.start_time || data.appointmentStartTime || data.start || null;
    const notes       = data.notes || data.appointment_notes || '';
    const slot        = getSlot(startTime);
    const dateStr     = getDateStr(startTime);
    const rdv_key     = `${dateStr}_${slot}`;

    /* Construit les lignes de prestation depuis les notes GHL */
    const lines = [{
      id: Math.random().toString(36).slice(2, 9),
      type: 'custom',
      label: notes || 'Réservation via Sofia (WhatsApp)',
      qty: 1,
      unitPrice: 0
    }];

    const record = {
      rdv_key,
      name,
      phone,
      address,
      notes: `Réservé via bot Sofia WhatsApp${notes ? ' — ' + notes : ''}`,
      source: 'WhatsApp Bot Sofia',
      status: 'confirmed',
      paid: false,
      payment: 'Virement',
      lines: JSON.stringify(lines),
      adjustments: JSON.stringify([]),
      total_amount: 0
    };

    /* Insert dans Supabase */
    const { error } = await supabase
      .from('rdvs')
      .upsert(record, { onConflict: 'rdv_key' });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('RDV inséré:', rdv_key, name);
    return res.status(200).json({ success: true, rdv_key, name });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
