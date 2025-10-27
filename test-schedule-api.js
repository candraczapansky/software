import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

async function testScheduleAPI() {
  console.log('🧪 Testing schedule API with new locationId field...');
  
  const sql = neon(DATABASE_URL);
  
  try {
    // Test connection
    console.log('🔍 Testing database connection...');
    await sql`SELECT 1`;
    console.log('✅ Database connection successful');
    
    // Check if we have locations
    console.log('\n📍 Checking locations...');
    const locations = await sql`SELECT id, name FROM locations LIMIT 3`;
    console.log('Locations found:', locations.length);
    locations.forEach(loc => {
      console.log(`  - ID: ${loc.id}, Name: ${loc.name}`);
    });
    
    // Check if we have staff
    console.log('\n👥 Checking staff...');
    const staff = await sql`SELECT id, title FROM staff LIMIT 3`;
    console.log('Staff found:', staff.length);
    staff.forEach(s => {
      console.log(`  - ID: ${s.id}, Title: ${s.title}`);
    });
    
    // Check current schedules
    console.log('\n📅 Checking current schedules...');
    const schedules = await sql`SELECT id, staff_id, day_of_week, location_id FROM staff_schedules LIMIT 5`;
    console.log('Schedules found:', schedules.length);
    schedules.forEach(schedule => {
      console.log(`  - ID: ${schedule.id}, Staff: ${schedule.staff_id}, Day: ${schedule.day_of_week}, Location: ${schedule.location_id}`);
    });
    
    // Test creating a new schedule
    if (locations.length > 0 && staff.length > 0) {
      console.log('\n➕ Testing schedule creation...');
      
      const testSchedule = {
        staffId: staff[0].id,
        dayOfWeek: 'Monday',
        startTime: '09:00',
        endTime: '17:00',
        locationId: locations[0].id,
        serviceCategories: [],
        startDate: '2024-12-20',
        endDate: null,
        isBlocked: false
      };
      
      console.log('Test schedule data:', testSchedule);
      
      try {
        const [newSchedule] = await sql`
          INSERT INTO staff_schedules (staff_id, day_of_week, start_time, end_time, location_id, service_categories, start_date, end_date, is_blocked)
          VALUES (${testSchedule.staffId}, ${testSchedule.dayOfWeek}, ${testSchedule.startTime}, ${testSchedule.endTime}, ${testSchedule.locationId}, ${testSchedule.serviceCategories}, ${testSchedule.startDate}, ${testSchedule.endDate}, ${testSchedule.isBlocked})
          RETURNING *
        `;
        
        console.log('✅ Schedule created successfully:', {
          id: newSchedule.id,
          staff_id: newSchedule.staff_id,
          location_id: newSchedule.location_id,
          day_of_week: newSchedule.day_of_week
        });
        
        // Clean up - delete the test schedule
        await sql`DELETE FROM staff_schedules WHERE id = ${newSchedule.id}`;
        console.log('🧹 Test schedule cleaned up');
        
      } catch (error) {
        console.error('❌ Failed to create test schedule:', error);
      }
    }
    
    console.log('\n🎉 Schedule API test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testScheduleAPI().catch(console.error);
