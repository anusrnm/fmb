import streamlit as st
import matplotlib.pyplot as plt
import pandas as pd

# Page setup
st.set_page_config(page_title="Real-Time FMB Generator", layout="wide")
st.title("🗺️ Real-Time Field Measurement Book (FMB) Generator")
st.write("Modify the surveyor data table below. Decimal/Floating numbers are fully supported!")

# 1. INITIALIZE DEFAULT LADDER DATA WITH FLOATING NUMBERS
default_data = {
    "Point": ["A (Start)", "B", "C", "D", "E", "F (End)"],
    "Chainage (m)": [0.0, 20.5, 45.2, 70.0, 100.7, 120.0],
    "Offset (m)": [0.0, 15.3, 25.8, 30.1, 10.4, 0.0],
    "Side": ["Center", "Left", "Right", "Left", "Right", "Center"]
}
df_initial = pd.DataFrame(default_data)

# 2. INTERACTIVE DATA TABLE WITH EXPLICIT FLOAT CONFIGURATION
st.subheader("📋 Surveyor's Ladder Data Table")
st.write("💡 *Double-click any cell to type a decimal value (e.g., 23.45).*")

edited_df = st.data_editor(
    df_initial,
    num_rows="dynamic",  # Allows users to add/delete rows
    column_config={
        "Chainage (m)": st.column_config.NumberColumn(
            label="Chainage (m)",
            help="Distance along the baseline",
            min_value=0.0,
            step=0.01,  # Allows floating point resolution down to centimetres
            format="%.2f"
        ),
        "Offset (m)": st.column_config.NumberColumn(
            label="Offset (m)",
            help="Perpendicular distance from the baseline",
            min_value=0.0,
            step=0.01,  # Allows floating point resolution down to centimetres
            format="%.2f"
        ),
        "Side": st.column_config.SelectboxColumn(
            options=["Left", "Right", "Center"],
            required=True
        )
    },
    use_container_width=True
)

# 3. PROCESS THE INTERACTIVE DATA INTO X,Y COORDINATES
x_coords = []
y_coords = []

for _, row in edited_df.iterrows():
    try:
        # Convert row values safely to float
        chainage = float(row["Chainage (m)"])
        offset = float(row["Offset (m)"])
        side = str(row["Side"]).strip().lower()
        
        x = chainage
        if "l" in side:
            y = offset
        elif "r" in side:
            y = -offset
        else:
            y = 0.0  # Center line
            
        x_coords.append(x)
        y_coords.append(y)
    except (ValueError, TypeError):
        continue

# 4. SORT AND CLOSE BOUNDARY POLYGON
if len(x_coords) >= 3:
    points = list(zip(x_coords, y_coords))
    
    # Split points to draw an organized exterior boundary loop
    left_side = [p for p in points if p[1] >= 0]
    right_side = [p for p in points if p[1] < 0]
    
    # Sort logically from start of baseline to the end and back
    left_side.sort(key=lambda p: p[0])
    right_side.sort(key=lambda p: p[0], reverse=True)
    
    closed_loop = left_side + right_side + [left_side[0]]
    bx, by = zip(*closed_loop)
    
    # Calculate Approximate Area using Shoelace Formula
    area_sqm = 0
    for i in range(len(closed_loop) - 1):
        area_sqm += (closed_loop[i][0] * closed_loop[i+1][1]) - (closed_loop[i+1][0] * closed_loop[i][1])
    area_sqm = abs(area_sqm) * 0.5
    area_hectares = area_sqm / 10000
else:
    bx, by = [], []
    area_sqm, area_hectares = 0.0, 0.0

# 5. GENERATE THE MATPLOTLIB PLOT
fig, ax = plt.subplots(figsize=(10, 5))

if x_coords:
    max_x = max(x_coords) if x_coords else 100
    # Plot baseline
    ax.plot([0, max_x], [0, 0], 'k--', alpha=0.6, label='Baseline')
    
    # Plot real-time boundary
    if len(bx) > 0:
        ax.plot(bx, by, 'g-', linewidth=2, label='Property Boundary')
    
    # Plot offsets & stations
    for i, (x, y) in enumerate(zip(x_coords, y_coords)):
        if i < len(edited_df):
            pt_label = str(edited_df.iloc[i]["Point"])
        else:
            pt_label = f"P{i}"
            
        if y != 0:
            ax.plot([x, x], [0, y], 'r:', alpha=0.7)  # Perpendicular offsets
        ax.scatter(x, y, color='blue', zorder=5)
        ax.text(x + 1, y + 1, f"{pt_label}\n({x:.2f}m, {abs(y):.2f}m)", fontsize=8)

# Styling details
ax.set_xlabel("Baseline Distance (m)")
ax.set_ylabel("Offset Distance (m)")
ax.grid(True, linestyle=':', alpha=0.5)
ax.axis('equal')  # Strict geometric scale preservation
ax.legend()

# 6. RENDER THE INTERACTIVE LAYOUT Side-by-Side
col1, col2 = st.columns([2, 1])

with col1:
    st.subheader("🗺️ Live FMB Map")
    st.pyplot(fig)

with col2:
    st.subheader("📊 Land Metrics")
    st.metric(label="Total Area (Sq. Metres)", value=f"{area_sqm:,.2f} m²")
    st.metric(label="Total Area (Hectares)", value=f"{area_hectares:.4f} ha")
    st.metric(label="Total Area (Acres)", value=f"{area_hectares * 2.47105:.3f} acres")
