import express from 'express'
import pool from '../config/db.js'

// Detect whether the DB uses qari_id or user_id for availability owner
let availabilityOwnerCol = 'qari_id'
let availabilityOwnerColChecked = false
async function ensureAvailabilityOwnerColumn() {
  if (availabilityOwnerColChecked) return availabilityOwnerCol
  try {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'availability_slots' AND column_name IN ('qari_id','user_id')
       ORDER BY case when column_name='qari_id' then 0 else 1 end
       LIMIT 1`
    )
    const name = res.rows?.[0]?.column_name
    if (name === 'user_id' || name === 'qari_id') availabilityOwnerCol = name
  } catch { /* ignore */ }
  availabilityOwnerColChecked = true
  return availabilityOwnerCol
}

const router = express.Router()

// Helper: extract qariId from Calendly payload (via utm fields or questions)
function extractQariId(payload) {
  // Prefer tracking.utm.campaign like "qari-123"
  const utm = payload?.tracking || {}
  const campaign = utm.utm_campaign || utm.campaign
  if (campaign && /^qari-\d+$/i.test(campaign)) {
    return Number(campaign.split('-')[1])
  }
  // Try questions_and_answers e.g., { question: 'qariId', answer: '123' }
  const qa = payload?.questions_and_answers || []
  const q = qa.find(x => String(x.question || '').toLowerCase().includes('qari'))
  if (q && q.answer && /^\d+$/.test(String(q.answer))) return Number(q.answer)
  return null
}

// Calendly webhook receiver (configure in Calendly Dashboard)
// Events: invitee.created, invitee.canceled
router.post('/webhook', express.json({ type: '*/*' }), async (req, res) => {
  try {
    const event = req.body?.event
    const payload = req.body?.payload
    if (!event || !payload) return res.status(400).json({ success: false })

    const start_time_iso = payload?.scheduled_event?.start_time
    const end_time_iso = payload?.scheduled_event?.end_time
    const start = start_time_iso ? new Date(start_time_iso) : null
    const end = end_time_iso ? new Date(end_time_iso) : null
    if (!start || !end) return res.status(200).json({ success: true }) // ignore

    const slot_date = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`
    const start_time = `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}:00`
    const end_time = `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}:00`

    const qariId = extractQariId(payload) // must be provided via UTM or question mapping
    if (!qariId) return res.status(200).json({ success: true }) // cannot map, ignore

    if (event === 'invitee.created') {
      // Create or confirm booking
      // If an availability slot does not exist, create it to block
      const ownerCol = await ensureAvailabilityOwnerColumn()
      await pool.query(
        `INSERT INTO availability_slots (${ownerCol}, slot_date, start_time, end_time)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (${ownerCol}, slot_date, start_time, end_time)
         DO UPDATE SET updated_at = NOW()`,
        [qariId, slot_date, start_time, end_time]
      )
      // Upsert booking as confirmed
      await pool.query(
        `INSERT INTO bookings (qari_id, student_id, slot_date, start_time, end_time, status)
         VALUES ($1, NULL, $2, $3, $4, 'confirmed')
         ON CONFLICT DO NOTHING`,
        [qariId, slot_date, start_time, end_time]
      )
    }

    if (event === 'invitee.canceled') {
      await pool.query(
        `UPDATE bookings SET status='cancelled', updated_at=NOW()
         WHERE qari_id=$1 AND slot_date=$2 AND start_time=$3 AND end_time=$4 AND status IN ('hold','confirmed')`,
        [qariId, slot_date, start_time, end_time]
      )
    }

    return res.status(200).json({ success: true })
  } catch (e) {
    console.error('Calendly webhook error', e)
    return res.status(200).json({ success: true })
  }
})

export default router


