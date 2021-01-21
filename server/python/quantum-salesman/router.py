from os import environ
from flask import Blueprint, current_app
from .controller import draw_tsp_solution

router = Blueprint('router', __name__)

@router.route('/hello')
def hello():
    return 'Hello, World!' + str(current_app.config.get("API_KEY")) + str(environ.get('DATABASE'))

@router.route('/qs')
def qs():
    return 'qs'