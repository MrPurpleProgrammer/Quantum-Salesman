from qiskit.optimization.problems import QuadraticProgram
from qiskit.optimization.algorithms import MinimumEigenOptimizer
from qiskit.optimization.applications.ising.common import sample_most_likely
from qiskit.aqua import QuantumInstance
from qiskit.aqua import aqua_globals
from qiskit.aqua.components.optimizers import SPSA
from qiskit.aqua.algorithms import VQE, NumPyMinimumEigensolver
from qiskit.optimization.applications.ising import tsp
from qiskit.tools.visualization import plot_histogram
from qiskit import Aer
import networkx as nx
import numpy as np
from itertools import permutations
# useful additional packages
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.axes as axes

def draw_graph(G, colors, pos):
    default_axes = plt.axes(frameon=True)
    nx.draw_networkx(G, node_color=colors, node_size=600, alpha=.8, ax=default_axes, pos=pos)
    edge_labels = nx.get_edge_attributes(G, 'weight')
    nx.draw_networkx_edge_labels(G, pos=pos, edge_labels=edge_labels)

exact = MinimumEigenOptimizer(NumPyMinimumEigensolver())
# setup aqua logging
# Generating a graph of 3 nodes
n = 3
num_qubits = n ** 2
ins = tsp.random_tsp(n, seed=123)
data = tsp.TspData()
print(data)
# Draw the graph
G = nx.Graph()
G.add_nodes_from(np.arange(0, ins.dim, 1))
colors = ['r' for node in G.nodes()]

for i in range(0, ins.dim):
    for j in range(i+1, ins.dim):
        G.add_edge(i, j, weight=ins.w[i, j])

pos = {k: v for k, v in enumerate(ins.coord)}

draw_graph(G, colors, pos)


def brute_force_tsp(w, N):
    a = list(permutations(range(1, N)))
    last_best_distance = 1e10
    for i in a:
        distance = 0
        pre_j = 0
        for j in i:
            distance = distance + w[j, pre_j]
            pre_j = j
        distance = distance + w[pre_j, 0]
        order = (0,) + i
        if distance < last_best_distance:
            best_order = order
            last_best_distance = distance
            print('order = ' + str(order) + ' Distance = ' + str(distance))
    return last_best_distance, best_order


best_distance, best_order = brute_force_tsp(ins.w, ins.dim)
print('Best order from brute force = ' + str(best_order) +
      ' with total distance = ' + str(best_distance))


def draw_tsp_solution(G, order, colors, pos):
    G2 = nx.DiGraph()
    G2.add_nodes_from(G)
    n = len(order)
    for i in range(n):
        j = (i + 1) % n
        G2.add_edge(order[i], order[j], weight=G[order[i]][order[j]]['weight'])
    default_axes = plt.axes(frameon=True)
    nx.draw_networkx(G2, node_color=colors, edge_color='b',
                     node_size=600, alpha=.8, ax=default_axes, pos=pos)
    edge_labels = nx.get_edge_attributes(G2, 'weight')
    nx.draw_networkx_edge_labels(
        G2, pos, font_color='b', edge_labels=edge_labels)


qubitOp, offset = tsp.get_operator(ins)
print('Offset:', offset)
print('Ising Hamiltonian:')
print(qubitOp.print_details())

qp = QuadraticProgram()
qp.from_ising(qubitOp, offset, linear=True)
qp.to_docplex().prettyprint()

result = exact.solve(qp)
print(result)

ee = NumPyMinimumEigensolver(qubitOp)
result = ee.run()

# print('energy:', result.eigenvalue.real)
# print('tsp objective:', result.eigenvalue.real + offset)
x = sample_most_likely(result.eigenstate)
print('feasible:', tsp.tsp_feasible(x))
z = tsp.get_tsp_solution(x)
print('solution:', z)
print('solution objective:', tsp.tsp_value(z, ins.w))
# draw_tsp_solution(G, z, colors, pos)
# draw_tsp_solution(G, best_order, colors, pos)
