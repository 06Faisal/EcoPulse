"""
Generate synthetic test data for EcoPulse ML evaluation
Creates realistic trip and bill data for multiple test users
"""

import sys
from pathlib import Path
import random
from datetime import datetime, timedelta

# Add ml package to path
sys.path.append(str(Path(__file__).parent / 'ml'))
from storage import init_db, insert_trip, insert_bill

# Pydantic models from app.py
from pydantic import BaseModel

class TripIn(BaseModel):
    user_id: str
    date: str
    distance: float
    co2: float
    vehicle: str = None


class BillIn(BaseModel):
    user_id: str
    date: str
    units: float


def generate_synthetic_user_data(user_id: str, num_days: int = 60):
    """
    Generate realistic synthetic data for a user
    
    Patterns simulated:
    - Weekday vs weekend behavior differences
    - Seasonal trends
    - Random noise
    - Different vehicle usage patterns
    """
    
    print(f"Generating data for {user_id}...")
    
    # Base parameters (different for each user type)
    user_profiles = {
        'user_eco_friendly': {
            'base_distance': 8.0,
            'base_co2_factor': 0.05,  # Bike/walk heavy
            'weekend_multiplier': 0.5,
            'vehicles': ['Bike', 'Walking', 'Bus', 'Train'],
            'vehicle_weights': [0.4, 0.3, 0.2, 0.1]
        },
        'user_moderate': {
            'base_distance': 15.0,
            'base_co2_factor': 0.12,  # Mixed transport
            'weekend_multiplier': 0.7,
            'vehicles': ['Car', 'Bus', 'Bike', 'Train'],
            'vehicle_weights': [0.4, 0.3, 0.2, 0.1]
        },
        'user_high_emission': {
            'base_distance': 25.0,
            'base_co2_factor': 0.21,  # Car heavy
            'weekend_multiplier': 1.2,
            'vehicles': ['Car', 'Car', 'Car', 'Bus'],
            'vehicle_weights': [0.7, 0.15, 0.1, 0.05]
        }
    }
    
    # Select profile
    if 'eco' in user_id:
        profile = user_profiles['user_eco_friendly']
    elif 'high' in user_id:
        profile = user_profiles['user_high_emission']
    else:
        profile = user_profiles['user_moderate']
    
    # Generate trips
    trips_created = 0
    start_date = datetime.now() - timedelta(days=num_days)
    
    for day in range(num_days):
        current_date = start_date + timedelta(days=day)
        
        # Number of trips per day (1-3)
        num_trips = random.choices([1, 2, 3], weights=[0.3, 0.5, 0.2])[0]
        
        # Weekend effect
        is_weekend = current_date.weekday() >= 5
        multiplier = profile['weekend_multiplier'] if is_weekend else 1.0
        
        # Seasonal effect (simple sine wave)
        day_of_year = day % 365
        seasonal_factor = 1.0 + 0.2 * random.random() * (1 + 0.3 * (day_of_year / 365))
        
        for _ in range(num_trips):
            # Select vehicle
            vehicle = random.choices(profile['vehicles'], weights=profile['vehicle_weights'])[0]
            
            # Calculate distance with randomness
            base_distance = profile['base_distance'] * multiplier * seasonal_factor
            distance = max(0.5, base_distance + random.gauss(0, base_distance * 0.3))
            
            # Calculate CO2 based on vehicle
            vehicle_factors = {
                'Car': 0.21,
                'Bike': 0.0,
                'Bus': 0.089,
                'Train': 0.041,
                'Walking': 0.0
            }
            co2_factor = vehicle_factors.get(vehicle, 0.15)
            co2 = distance * co2_factor + random.gauss(0, 0.5)
            co2 = max(0, co2)  # No negative emissions
            
            # Create trip
            trip = TripIn(
                user_id=user_id,
                date=current_date.isoformat(),
                distance=round(distance, 2),
                co2=round(co2, 2),
                vehicle=vehicle
            )
            
            insert_trip(trip)
            trips_created += 1
    
    # Generate monthly electricity bills (2-3 bills)
    num_bills = random.randint(2, 3)
    for i in range(num_bills):
        bill_date = start_date + timedelta(days=i * 30)
        
        # Monthly usage varies by user type
        if 'eco' in user_id:
            base_units = random.uniform(150, 250)
        elif 'high' in user_id:
            base_units = random.uniform(400, 600)
        else:
            base_units = random.uniform(250, 400)
        
        bill = BillIn(
            user_id=user_id,
            date=bill_date.isoformat(),
            units=round(base_units, 2)
        )
        
        insert_bill(bill)
    
    print(f"  Created {trips_created} trips and {num_bills} bills")
    return trips_created


def main():
    """Generate synthetic data for multiple test users"""
    
    print("=" * 80)
    print("EcoPulse AI - Synthetic Data Generator")
    print("=" * 80)
    print()
    
    # Initialize database
    init_db()
    print("Database initialized")
    print()
    
    # Create different user types
    test_users = [
        ('user_eco_friendly_001', 60),
        ('user_eco_friendly_002', 45),
        ('user_moderate_001', 60),
        ('user_moderate_002', 50),
        ('user_moderate_003', 40),
        ('user_high_emission_001', 60),
        ('user_high_emission_002', 55),
    ]
    
    total_trips = 0
    for user_id, num_days in test_users:
        trips = generate_synthetic_user_data(user_id, num_days)
        total_trips += trips
    
    print()
    print("=" * 80)
    print(f"Data generation complete!")
    print(f"Total users: {len(test_users)}")
    print(f"Total trips: {total_trips}")
    print("=" * 80)


if __name__ == "__main__":
    main()
