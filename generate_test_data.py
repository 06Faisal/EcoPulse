"""
Generate synthetic test data for EcoPulse ML evaluation
Creates realistic trip and bill data for multiple test users
"""

import sys
from pathlib import Path
import random
from datetime import datetime, timedelta

# `ml/` holds the SQLite storage layer used only by the offline harness.
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
        
        import math
        
        # Weekend effect
        is_weekend = current_date.weekday() >= 5
        multiplier = profile['weekend_multiplier'] if is_weekend else 1.0
        
        # Number of trips per day - make it more consistent
        num_trips = 1 if is_weekend else 2
        
        # Seasonal effect (smooth sine wave)
        day_of_year = day % 365
        seasonal_factor = 1.0 + 0.3 * math.sin(2 * math.pi * day_of_year / 365)
        
        for i in range(num_trips):
            # Select vehicle (more consistent)
            vehicle = profile['vehicles'][i % len(profile['vehicles'])]
            
            # Calculate distance with moderate randomness for realistic results
            base_distance = profile['base_distance'] * multiplier * seasonal_factor
            distance = max(0.5, base_distance + random.gauss(0, base_distance * 0.12))
            
            # Calculate CO2 based on vehicle
            vehicle_factors = {
                'Car': 0.21,
                'Bike': 0.0,
                'Bus': 0.089,
                'Train': 0.041,
                'Walking': 0.0
            }
            co2_factor = vehicle_factors.get(vehicle, 0.15)
            # Add moderate random noise to make the ML target realistic but not entirely unlearnable
            co2 = distance * co2_factor + random.gauss(0, 0.4)
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
    import os
    db_path = Path(__file__).parent / 'data' / 'ecopulse.db'
    if db_path.exists():
        os.remove(db_path)
        print("Cleaned up old database")
    
    init_db()
    print("Database initialized")
    print()
    
    # Create different user types with a larger amount of data for robust ML evaluation
    test_users = [
        ('user_eco_friendly_001', 120),
        ('user_eco_friendly_002', 90),
        ('user_eco_friendly_003', 100),
        ('user_eco_friendly_004', 110),
        ('user_moderate_001', 120),
        ('user_moderate_002', 100),
        ('user_moderate_003', 90),
        ('user_moderate_004', 115),
        ('user_high_emission_001', 120),
        ('user_high_emission_002', 95),
        ('user_high_emission_003', 105),
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
