import React, { useCallback, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'

const TravelFlowChart = ({ travelData }) => {
  const initialNodes = useMemo(() => {
    if (!travelData) return []

    const nodes = []
    let yPos = 50

    // 시작 노드
    nodes.push({
      id: 'start',
      type: 'default',
      position: { x: 250, y: yPos },
      data: { label: `🛫 출발 (${travelData.destination})` },
      style: { 
        background: '#10b981', 
        color: 'white', 
        border: '2px solid #059669',
        borderRadius: '8px',
        padding: '10px 20px',
        fontWeight: 'bold'
      },
    })

    yPos += 100

    // 항공권 노드
    if (travelData.flights && travelData.flights.length > 0) {
      nodes.push({
        id: 'flight',
        type: 'default',
        position: { x: 250, y: yPos },
        data: { 
          label: `✈️ ${travelData.flights[0].airline}\n${travelData.flights[0].departure} → ${travelData.flights[0].arrival}\n${travelData.flights[0].departure_time}` 
        },
        style: { 
          background: '#3b82f6', 
          color: 'white', 
          border: '2px solid #2563eb',
          borderRadius: '8px',
          padding: '10px 20px',
          width: '250px',
          whiteSpace: 'pre-line',
          textAlign: 'center'
        },
      })
      yPos += 120
    }

    // 숙소 노드
    if (travelData.accommodations && travelData.accommodations.length > 0) {
      nodes.push({
        id: 'accommodation',
        type: 'default',
        position: { x: 250, y: yPos },
        data: { 
          label: `🏨 ${travelData.accommodations[0].name}\n⭐ ${travelData.accommodations[0].rating || 'N/A'}` 
        },
        style: { 
          background: '#8b5cf6', 
          color: 'white', 
          border: '2px solid #7c3aed',
          borderRadius: '8px',
          padding: '10px 20px',
          width: '250px',
          whiteSpace: 'pre-line',
          textAlign: 'center'
        },
      })
      yPos += 120
    }

    // 여행지/액티비티 노드
    if (travelData.attractions && travelData.attractions.length > 0) {
      travelData.attractions.forEach((attraction, index) => {
        nodes.push({
          id: `attraction-${index}`,
          type: 'default',
          position: { x: 250, y: yPos },
          data: { 
            label: `🎯 ${attraction.name || attraction}\n${attraction.duration || ''}` 
          },
          style: { 
            background: '#f59e0b', 
            color: 'white', 
            border: '2px solid #d97706',
            borderRadius: '8px',
            padding: '10px 20px',
            width: '250px',
            whiteSpace: 'pre-line',
            textAlign: 'center'
          },
        })
        yPos += 100
      })
    }

    // 날씨 노드
    if (travelData.weather) {
      nodes.push({
        id: 'weather',
        type: 'default',
        position: { x: 250, y: yPos },
        data: { 
          label: `🌤️ 날씨\n${travelData.weather.city}\n${travelData.weather.forecasts?.[0]?.temp}°C, ${travelData.weather.forecasts?.[0]?.description || ''}` 
        },
        style: { 
          background: '#06b6d4', 
          color: 'white', 
          border: '2px solid #0891b2',
          borderRadius: '8px',
          padding: '10px 20px',
          width: '250px',
          whiteSpace: 'pre-line',
          textAlign: 'center'
        },
      })
      yPos += 120
    }

    // 종료 노드
    nodes.push({
      id: 'end',
      type: 'default',
      position: { x: 250, y: yPos },
      data: { label: `🏠 귀국` },
      style: { 
        background: '#ef4444', 
        color: 'white', 
        border: '2px solid #dc2626',
        borderRadius: '8px',
        padding: '10px 20px',
        fontWeight: 'bold'
      },
    })

    return nodes
  }, [travelData])

  const initialEdges = useMemo(() => {
    if (!initialNodes || initialNodes.length < 2) return []

    const edges = []
    for (let i = 0; i < initialNodes.length - 1; i++) {
      edges.push({
        id: `edge-${i}`,
        source: initialNodes[i].id,
        target: initialNodes[i + 1].id,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#64748b', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#64748b',
        },
      })
    }
    return edges
  }, [initialNodes])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  return (
    <div style={{ width: '100%', height: '600px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        attributionPosition="bottom-left"
      >
        <Background gap={12} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  )
}

export default TravelFlowChart